import type { SupabaseClient } from "@supabase/supabase-js";

export interface DisplayDevice {
  id: number;
  device_secret: string;
  branch_id: number | null;
  pos_device_id: string | null;
}

/**
 * أيُّ شاشات العميل يُعرض عليها ما يرسله هذا الكاشير.
 *
 * منقولٌ بنصّه من show-loyalty-barcode (وتعليلُه هناك) ليشترك فيه
 * باركودُ الولاء وبيجرُ ركين: الفرعُ أولاً، ثم نقطةُ البيع -- ولا سقوطَ
 * إلى "كلِّ الشاشات". فلو اختلف المساران لَظهر بيجرُ زبونٍ على شاشة فرعٍ
 * آخر وولاؤه على الصحيحة.
 *
 *   ١) شاشاتُ هذا الفرع (وما لم يُنسب لفرعٍ بعد).
 *   ٢) منها: المربوطةُ بنقطة البيع هذي إن وُجدت، وإلا غيرُ المربوطة.
 */
export async function displayTargets(
  asCashier: SupabaseClient,
  branchId: number | null,
  posDeviceId: string | null,
): Promise<DisplayDevice[]> {
  const { data: displays } = await asCashier
    .from("display_devices")
    .select("id, device_secret, branch_id, pos_device_id");
  const all = (displays || []) as DisplayDevice[];
  const inBranch = branchId
    ? all.filter(d => d.branch_id === branchId || d.branch_id == null)
    : all.filter(d => d.branch_id == null);
  const mine = posDeviceId ? inBranch.filter(d => d.pos_device_id === posDeviceId) : [];
  return mine.length ? mine : inBranch.filter(d => d.pos_device_id == null);
}
