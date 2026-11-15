import { supabase } from '../infrastructure/supabaseClient';

/**
 * قوالب الخصم التي عرّفها صاحب المطعم.
 *
 * «خصم ٣٠٪» في تقريرٍ لا يقول إن كانت عروض اليوم الوطني أم ضيافةً أم
 * تسويةَ شكوى. فالقالب يحمل عنوانه، ويملأ به سببَ الخصم -- فتتجمّع
 * إحصاءات التقرير على الاسم بلا عمودٍ جديد على الطلبات، ويبقى طلبُ
 * الأمس حاملًا الاسم الذي بِيع به لو أُعيدت التسمية غدًا.
 *
 * والخصم المفتوح يبقى إلى جانبها: قوالبُ بلا حرّية تعني كاشيرًا يختار
 * أقربها ويكذب على التقرير.
 */
export interface DiscountPreset {
  id: number;
  name: string;
  nameEn?: string | null;
  pct: number;
  /** خصم بمبلغ ثابت (ريال) بدل النسبة -- null = بالنسبة. */
  amount?: number | null;
}

export async function listDiscountPresets(): Promise<DiscountPreset[]> {
  // قبل ترحيل 20260916090000 لا وجود للجدول -- تُرجَع قائمةٌ فارغة
  // فتظهر النافذة بالنِّسَب وحدها، بلا خطأ في وجه الكاشير.
  // amount عمود أحدث: قبل ما ينزل يرجع خطأ، فنسأل بدونه.
  let res = await supabase
    .from('discount_presets')
    .select('id, name, name_en, pct, amount')
    .eq('active', true)
    .order('sort_order')
    .order('id');
  if (res.error) {
    res = (await supabase
      .from('discount_presets')
      .select('id, name, name_en, pct')
      .eq('active', true)
      .order('sort_order')
      .order('id')) as typeof res;
  }
  const { data, error } = res;
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(r => ({
    id: Number(r.id),
    name: String(r.name),
    nameEn: r.name_en ? String(r.name_en) : null,
    pct: Number(r.pct ?? 0),
    amount: r.amount != null ? Number(r.amount) : null,
  }));
}
