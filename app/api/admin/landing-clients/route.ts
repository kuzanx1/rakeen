import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAuth";
import { cleanIds, getShownIds, setShownIds } from "@/lib/landingClients";

// /admin «عملاء الهبوط»: every business with its logo, plus the ordered list
// of the ones shown in the landing page's customers strip.

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ("response" in guard) return guard.response;
  const [{ data, error }, shown] = await Promise.all([
    guard.admin.from("businesses").select("id, name, logo_url, business_type").order("created_at", { ascending: true }),
    getShownIds(guard.admin),
  ]);
  if (error) return NextResponse.json({ error: "تعذر تحميل المطاعم" }, { status: 500 });
  return NextResponse.json({ businesses: data || [], shown });
}

export async function PUT(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ("response" in guard) return guard.response;
  const body = (await request.json().catch(() => null)) as { shown?: unknown } | null;
  const ids = cleanIds(body?.shown);

  // Only real businesses that have a logo can be shown.
  if (ids.length) {
    const { data } = await guard.admin.from("businesses").select("id, logo_url").in("id", ids);
    const ok = new Set((data || []).filter((b) => b.logo_url).map((b) => b.id as number));
    const bad = ids.filter((id) => !ok.has(id));
    if (bad.length) return NextResponse.json({ error: "فيه مطعم بدون شعار أو غير موجود" }, { status: 400 });
  }

  const { error } = await setShownIds(guard.admin, ids, guard.email);
  if (error) {
    await logAdminAction(guard.admin, guard.email, "settings.landing_clients", null, "failure", { reason: error.message });
    return NextResponse.json({ error: "تعذر الحفظ" }, { status: 500 });
  }
  await logAdminAction(guard.admin, guard.email, "settings.landing_clients", null, "success", { shown: ids });
  return NextResponse.json({ shown: ids });
}
