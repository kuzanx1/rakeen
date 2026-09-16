import { supabase } from '../infrastructure/supabaseClient';

/**
 * تسجيل الهدر من الكاشير.
 *
 * مكانه هنا لا في لوحة التحكم وحدها: من يقع الكوب من يده هو الباريستا
 * وقت الزحمة، لا صاحب المطعم على مكتبه مساءً. ولو عاش الزرّ في اللوحة
 * فقط لما سُجّل هدرٌ قط، ولما بقي منه إلا فرقُ جردٍ مجهول آخر الشهر.
 *
 * والسبب إجباري: التسجيل نفسه اختياري -- فمن سجّل فقد اختار -- لكن
 * هدرًا بلا سبب رقمٌ لا يُقرأ منه شيء، لا يُعرف أهو تلفٌ يستدعي تغيير
 * مورّد أم انسكابٌ يستدعي تدريبًا.
 */
export const WASTE_REASONS = ['تلف', 'انسكاب', 'انتهت الصلاحية', 'خطأ تحضير', 'أخرى'] as const;

export interface StockPick {
  id: number;
  name: string;
  unit: string;
}

/**
 * مواد المخزون لاختيار ما راح.
 *
 * تُجلب هنا لا تُمرَّر من الشاشة: الكتالوج يعيش داخل شاشة المنتجات،
 * وشاشة «المزيد» لا تراه. وجلبُها عند فتح النافذة وحدها أرخص من رفع
 * الكتالوج كلّه إلى جذر التطبيق لأجل قائمةٍ تُفتح مرّة في اليوم.
 */
export async function listStockItems(): Promise<StockPick[]> {
  const { data, error } = await supabase
    .from('stock_items')
    .select('id, name, unit')
    .order('name');
  if (error || !data) return [];
  return data.map(r => ({ id: Number(r.id), name: String(r.name), unit: String(r.unit) }));
}

export interface WasteResult {
  ok: boolean;
  /** كلفة ما راح -- تُقال للكاشير فورًا، فالرقم وحده يعلّم. */
  cost?: number;
  error?: string;
}

export async function recordWaste(
  stockItemId: number,
  qty: number,
  reason: string,
  unit?: string | null,
): Promise<WasteResult> {
  if (!(qty > 0)) return { ok: false, error: 'اكتب كمية أكبر من صفر' };
  if (!reason.trim()) return { ok: false, error: 'اختر سبب الهدر' };

  const { data, error } = await supabase.rpc('rk_record_waste', {
    p_stock_item_id: stockItemId,
    p_qty: qty,
    p_reason: reason.trim(),
    p_unit: unit || null,
  });

  if (error) {
    // قبل تشغيل ترحيل 20260916060000 لا وجود للدالة -- يُقال السبب
    // صراحةً بدل رسالة خادمٍ لا يفهمها من يقف على الكاشير.
    const msg = error.message || '';
    if (/rk_record_waste/.test(msg) || (error as { code?: string }).code === 'PGRST202') {
      return { ok: false, error: 'تسجيل الهدر يحتاج تحديث من لوحة التحكم' };
    }
    return { ok: false, error: msg || 'تعذّر تسجيل الهدر' };
  }

  const out = (data || {}) as { cost?: number };
  return { ok: true, cost: Number(out.cost) || 0 };
}
