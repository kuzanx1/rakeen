import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAuth";
import { validateBank } from "@/lib/contracts";
import { getBank } from "@/lib/platformBank";

// Rakeen's bank account shown in new contracts and on the subscriber's pay
// screen. Changing it never touches contracts already signed: each one
// keeps the account it was signed with in its own snapshot.

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ("response" in guard) return guard.response;
  return NextResponse.json({ bank: await getBank(guard.admin) });
}

export async function PUT(request: NextRequest) {
  const guard = await requireAdmin(request, "RL_ADMIN_SENSITIVE");
  if ("response" in guard) return guard.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const { bank, error } = validateBank(body || {});
  if (!bank) return NextResponse.json({ error }, { status: 400 });

  const { error: dbError } = await guard.admin
    .from("platform_settings")
    .upsert({ key: "bank", value: bank, updated_at: new Date().toISOString(), updated_by: guard.email });
  if (dbError) {
    await logAdminAction(guard.admin, guard.email, "settings.bank_update", null, "failure", { reason: dbError.message });
    return NextResponse.json({ error: "تعذر حفظ الحساب البنكي" }, { status: 500 });
  }
  await logAdminAction(guard.admin, guard.email, "settings.bank_update", null, "success", bank);
  return NextResponse.json({ bank });
}
