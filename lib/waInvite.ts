import type { SupabaseClient } from "@supabase/supabase-js";

// «جولة» نافذة «جديد ركين على الواتساب» في اللوحة. كل جهاز يحفظ إنه أرسل أو
// تجاهل الجولة رقم N؛ رفع الرقم من /admin يرجّع النافذة للكل. محفوظة في
// platform_settings (key "wa_invite"). الجولة 2 هي اللي كانت مكتوبة في الكود
// قبل ما يصير لها زر، فهي الأساس لو ما فيه صف.
export const WA_INVITE_BASE_ROUND = 2;

export type WaInviteState = { round: number; updatedAt: string | null; updatedBy: string | null };

export async function getWaInvite(admin: SupabaseClient): Promise<WaInviteState> {
  const { data } = await admin.from("platform_settings").select("value, updated_at, updated_by").eq("key", "wa_invite").maybeSingle();
  const r = Number((data?.value as { round?: unknown } | null)?.round);
  return {
    round: Number.isInteger(r) && r >= WA_INVITE_BASE_ROUND ? r : WA_INVITE_BASE_ROUND,
    updatedAt: (data?.updated_at as string | null) ?? null,
    updatedBy: (data?.updated_by as string | null) ?? null,
  };
}
