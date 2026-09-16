import { supabase } from '../infrastructure/supabaseClient';
import { getBusinessType, loadCatalog } from './catalogService';

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

/* ═══ هدر المنتجات ═══════════════════════════════════════════
   أكثر الهدر في المطاعم منتجٌ تامّ لا مادة خام: وجبة عامل، كوبٌ رُدّ،
   صنفٌ احترق. والباريستا لا يعرف أن «وجبة الموظف» تعني ١٨٠غ دجاج
   و٥٠غ أرزّ -- يعرف أنها وجبة. فالخصم يُحسب في الخادم من الوصفة
   نفسها التي يُحسب بها البيع.

   والخيارات المرتبطة بالمخزون تُمرَّر كما يمرّرها البيع، أو تُترك
   عمدًا -- ويُقال للكاشير أيهما وقع، لا يُخمَّن. */

export interface ProductPick {
  id: number;
  name: string;
  nameEn?: string | null;
}

export interface WasteOptionPick {
  key: string;          // `${groupId}_${optionId}`
  groupName: string;
  optionName: string;
  stockItemId: number;
  qty: number;
  unit?: string | null;
}

export interface ProductWasteResult {
  ok: boolean;
  cost?: number;
  /** صفرٌ هنا ليس خطأ: منتجٌ بلا وصفة يُسجَّل هدره ولا يُخصم منه شيء. */
  deductedFromStock?: boolean;
  error?: string;
}

export async function recordProductWaste(
  menuItemId: number,
  qty: number,
  reason: string,
  stockDecrements: { stock_item_id: number; qty: number }[] = [],
): Promise<ProductWasteResult> {
  if (!(qty > 0)) return { ok: false, error: 'اكتب كمية أكبر من صفر' };
  if (!reason.trim()) return { ok: false, error: 'اختر سبب الهدر' };

  const { data, error } = await supabase.rpc('rk_record_product_waste', {
    p_menu_item_id: menuItemId,
    p_qty: qty,
    p_reason: reason.trim(),
    p_stock_decrements: stockDecrements,
    p_box_selections: null,
  });

  if (error) {
    const msg = error.message || '';
    if (/rk_record_product_waste/.test(msg) || (error as { code?: string }).code === 'PGRST202') {
      return { ok: false, error: 'تسجيل هدر المنتجات يحتاج تحديث من لوحة التحكم' };
    }
    return { ok: false, error: msg || 'تعذّر تسجيل الهدر' };
  }

  const out = (data || {}) as { cost?: number; deductedFromStock?: boolean };
  return { ok: true, cost: Number(out.cost) || 0, deductedFromStock: !!out.deductedFromStock };
}

/** المنتجات وخياراتها المرتبطة بالمخزون -- تُجلب من نفس الكتالوج الذي
 *  يبيع منه الكاشير، فلا يفترق ما يُهدر عمّا يُباع. */
export interface WasteCatalog {
  products: ProductPick[];
  /** `${groupId}_${optionId}` -> الخيار وربطُه بالمخزون */
  optionsByProduct: Record<number, WasteOptionPick[]>;
}

export async function loadWasteCatalog(businessId: number): Promise<WasteCatalog> {
  try {
    const type = await getBusinessType(businessId);
    const cat = await loadCatalog(businessId, type);
    const optionsByProduct: Record<number, WasteOptionPick[]> = {};
    Object.entries(cat.modifiersByProductId).forEach(([pid, def]) => {
      const picks: WasteOptionPick[] = [];
      def.groups.forEach(g => {
        g.options.forEach(o => {
          const link = cat.optionStock[`${g.id}_${o.id}`];
          if (!link) return;
          picks.push({
            key: `${g.id}_${o.id}`,
            groupName: g.name,
            optionName: o.name,
            stockItemId: link.stockItemId,
            qty: link.qty,
            unit: link.unit,
          });
        });
      });
      if (picks.length) optionsByProduct[Number(pid)] = picks;
    });
    return {
      products: cat.products
        .filter(p => p.id > 0)
        .map(p => ({ id: p.id, name: p.name, nameEn: p.nameEn || null })),
      optionsByProduct,
    };
  } catch {
    return { products: [], optionsByProduct: {} };
  }
}
