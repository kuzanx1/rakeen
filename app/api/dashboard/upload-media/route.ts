import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";

// Every image upload in the dashboard (menu items, business branding, loyalty
// branding) goes through here instead of straight to Supabase Storage —
// Storage bills cached egress with a small free tier, which a handful of
// unoptimized photos blew through in the first week with a single
// restaurant. R2 has zero egress fees, so this is where that risk goes away
// for good rather than being managed around.
//
// Same folder names and per-folder permission as the old Supabase Storage
// RLS policies they replace (see the now-unused policies in
// 20260802200443_loyalty_card_push_and_branding.sql,
// 20260803010000_business_logo_and_report_exports.sql, and
// 20260808030000_menu_item_images.sql) — owner/manager always allowed,
// otherwise the specific screen permission.
const FOLDER_PERMISSIONS: Record<string, string> = {
  "menu-item-images": "screen:menu",
  "business-branding": "screen:settings",
  "loyalty-branding": "screen:loyalty",
};

const MEDIA_PUBLIC_BASE_URL = "https://media.rakeenapp.com";

// Real content sniffing, not the browser-supplied filename/MIME (both are
// attacker-controlled) — this is what actually keeps an uploaded ".jpg"
// from secretly being an SVG-with-a-script or an HTML page, either of which
// would otherwise get served back publicly from our own media.rakeenapp.com
// origin with an attacker-chosen extension. Only real raster image formats
// are accepted; the extension in the stored key always comes from this
// detection, never from the client-supplied filename.
function sniffImageType(bytes: Uint8Array): { ext: string; contentType: string } | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { ext: "png", contentType: "image/png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: "jpg", contentType: "image/jpeg" };
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return { ext: "gif", contentType: "image/gif" };
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { ext: "webp", contentType: "image/webp" };
  }
  return null;
}

// Minimal shape of the R2 binding this route actually uses — matches the
// existing pattern for the EMAIL binding in app/api/reports/send-email
// (manual cast, no @cloudflare/workers-types dependency for one method).
interface R2BucketLike {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }): Promise<unknown>;
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const asCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user: caller }, error: callerError } = await asCaller.auth.getUser(token);
  if (callerError || !caller) return NextResponse.json({ error: "جلسة غير صالحة" }, { status: 401 });

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: profile } = await admin.from("profiles").select("id, business_id, user_type").eq("id", caller.id).single();
  if (!profile) return NextResponse.json({ error: "الحساب غير موجود" }, { status: 403 });

  if (!(await checkRateLimit(request, "RL_UPLOAD", String(profile.business_id)))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }
  if (!(await checkDbRateLimit(admin, request, "RL_UPLOAD", 15, 60, String(profile.business_id)))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const folder = formData?.get("folder");
  const prefix = formData?.get("prefix");
  if (!(file instanceof File) || typeof folder !== "string" || !FOLDER_PERMISSIONS[folder] || typeof prefix !== "string" || !prefix) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "حجم الملف كبير جداً" }, { status: 413 });
  }

  if (!["owner", "manager"].includes(profile.user_type)) {
    const { data: perm } = await admin
      .from("user_permissions").select("permission_key").eq("user_id", profile.id).eq("permission_key", FOLDER_PERMISSIONS[folder]).maybeSingle();
    if (!perm) return NextResponse.json({ error: "ما عندك صلاحية على هذا الرفع" }, { status: 403 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const bucket = (env as unknown as { MEDIA_BUCKET?: R2BucketLike }).MEDIA_BUCKET;
  if (!bucket) return NextResponse.json({ error: "التخزين غير مهيأ" }, { status: 503 });

  const buf = await file.arrayBuffer();
  const sniffed = sniffImageType(new Uint8Array(buf.slice(0, 12)));
  if (!sniffed) {
    return NextResponse.json({ error: "الملف لازم يكون صورة (PNG, JPG, GIF, WEBP)" }, { status: 400 });
  }

  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60) || "file";
  const key = `${folder}/${profile.business_id}/${safePrefix}-${Date.now()}.${sniffed.ext}`;

  try {
    await bucket.put(key, buf, {
      httpMetadata: { contentType: sniffed.contentType, cacheControl: "public, max-age=2592000" },
    });
  } catch (err) {
    console.error("upload-media: R2 put failed", err);
    return NextResponse.json({ error: "تعذر رفع الملف" }, { status: 502 });
  }

  return NextResponse.json({ url: `${MEDIA_PUBLIC_BASE_URL}/${key}` });
}
