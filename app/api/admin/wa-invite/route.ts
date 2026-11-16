import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAuth";
import { getWaInvite } from "@/lib/waInvite";

// زر «أظهر نافذة الواتساب للكل من جديد»: يرفع رقم الجولة، فكل صاحب لوحة
// تطلع له النافذة مرة ثانية (حتى اللي أرسل أو تجاهل قبل).

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ("response" in guard) return guard.response;
  return NextResponse.json(await getWaInvite(guard.admin));
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request, "RL_ADMIN_SENSITIVE");
  if ("response" in guard) return guard.response;
  const cur = await getWaInvite(guard.admin);
  const next = cur.round + 1;
  const updatedAt = new Date().toISOString();
  const { error } = await guard.admin
    .from("platform_settings")
    .upsert({ key: "wa_invite", value: { round: next }, updated_at: updatedAt, updated_by: guard.email });
  if (error) {
    await logAdminAction(guard.admin, guard.email, "settings.wa_invite_reshow", null, "failure", { reason: error.message });
    return NextResponse.json({ error: "تعذر الحفظ" }, { status: 500 });
  }
  await logAdminAction(guard.admin, guard.email, "settings.wa_invite_reshow", null, "success", { round: next });
  return NextResponse.json({ round: next, updatedAt, updatedBy: guard.email });
}
