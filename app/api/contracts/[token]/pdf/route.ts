import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rateLimit";

// Archives the PDF the signing page renders right after a successful
// signature, so the admin has the file without opening it themselves.
// Accepted once, only for a signed contract, only within 2 hours of
// signing. The PDF is a rendering — the authoritative record is the
// signed row (snapshot + signature + document_hash), and the admin can
// regenerate and re-upload the PDF from /admin at any time.

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
const MAX_PDF = 10 * 1024 * 1024;

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN.test(token)) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 });
  if (!(await checkRateLimit(request, "RL_UPLOAD", token))) return NextResponse.json({ error: "محاولات كثيرة" }, { status: 429 });

  const admin = createClient(url, key);
  const { data: row } = await admin
    .from("subscription_contracts")
    .select("id, contract_number, status, signed_at, pdf_path")
    .eq("token", token)
    .maybeSingle();
  if (!row || row.status !== "signed" || !row.signed_at) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  if (row.pdf_path) return NextResponse.json({ ok: true, already: true });
  if (Date.now() - Date.parse(row.signed_at) > 2 * 3600 * 1000) return NextResponse.json({ error: "انتهت مهلة الحفظ" }, { status: 410 });

  const buf = await request.arrayBuffer();
  if (buf.byteLength === 0 || buf.byteLength > MAX_PDF) return NextResponse.json({ error: "حجم الملف غير مقبول" }, { status: 400 });
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, 5));
  if (head !== "%PDF-") return NextResponse.json({ error: "الملف ليس PDF" }, { status: 400 });

  const path = `${row.id}/signed-${row.contract_number}.pdf`;
  const { error } = await admin.storage.from("contracts").upload(path, buf, { contentType: "application/pdf", upsert: false });
  if (error) return NextResponse.json({ error: "تعذر حفظ الملف" }, { status: 500 });
  await admin.from("subscription_contracts").update({ pdf_path: path }).eq("id", row.id).is("pdf_path", null);
  return NextResponse.json({ ok: true });
}
