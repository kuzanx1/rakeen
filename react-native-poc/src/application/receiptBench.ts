/**
 * قياسُ الطباعة على الجهاز نفسِه.
 *
 * التخطيطُ يُقاس في node، ورقمُه واحدٌ في العميلين لأنّه الحسابُ نفسُه
 * (`npm run receipt:bench`). أمّا الرسمُ فلا: Skia على أيباد شيءٌ،
 * والكانفس في متصفّح شيءٌ آخر -- ولا يُعرف زمنُه ولا ذاكرتُه إلّا من
 * الجهاز الذي سيطبع.
 *
 * فيُقاس هنا ما لا يُقاس هناك: كم يأخذ إنشاءُ السطح، وكم يأخذ رسمُ
 * الأوامر، وكم تأخذ قراءةُ البكسلات وترميزُها. ثمّ يُقرأ من شاشة
 * التشخيص، فلا يبقى الأداءُ وصفاً -- «أحياناً يعلّق» -- بل يصير رقماً
 * له اسم.
 *
 * وهو لا يطبع شيئاً: يبني الصورةَ ويرميها. فيُشغَّل والدرجُ مغلقٌ
 * والطابعةُ مطفأة.
 */

import { Skia } from '@shopify/react-native-skia';
import { layoutReceipt, layoutKitchenTicket, layoutShiftReport, DEFAULT_PAPER_WIDTH } from '../../../shared/receipt';
import type {
  KitchenTicketModel, Measurer, ReceiptItem, ReceiptModel, ShiftReportModel,
} from '../../../shared/receipt';
import type { Scenario } from '../../../shared/receipt/scenarios';
import { createReceiptSurface } from '../platform/receiptCanvas';
import { loadReceiptTypefaces } from '../platform/receiptFonts';
import { buildReceiptFontProvider, measureTextWidthWeighted } from '../platform/receiptText';
import { rgbaToEscPosRasterLegacy } from '../domain/escposRaster';
import { paintReceiptOps } from './receiptRenderer';

const RIYAL = '﷼';

export interface BenchRow {
  items: number;
  /** حسابُ المواضع -- مشتركٌ مع الويب. */
  layoutMs: number;
  /** إنشاءُ سطح Skia -- وهو ما يحجز الذاكرة. */
  surfaceMs: number;
  /** رسمُ الأوامر: نصوصٌ وأشرطةٌ وصورة. */
  paintMs: number;
  /** قراءةُ البكسلات ثم ترميزُها ESC/POS. */
  encodeMs: number;
  totalMs: number;
  /** ارتفاعُ الورقة بالنقاط. */
  height: number;
  ops: number;
  /** ما تحجزه اللوحة: أربعةُ بايتاتٍ للبكسل. */
  megabytes: number;
}

function item(i: number): ReceiptItem {
  return {
    name: `سبانيش لاتيه ${i}`,
    nameEn: `Spanish Latte ${i}`,
    qty: (i % 3) + 1,
    unitPrice: 18,
    lineTotal: 18 * ((i % 3) + 1),
    mods: i % 4 === 0 ? ['حليب شوفان', 'شوت إضافي'] : [],
    note: i % 7 === 0 ? 'بدون سكر نهائياً مع ملعقة إضافية' : null,
  };
}

export function benchReceipt(n: number): ReceiptModel {
  return {
    businessName: 'مقهى هبيّة',
    tagline: 'قهوة مختصة',
    branchName: 'الفرع الرئيسي',
    vatNumber: '310000000000003',
    orderNumber: '1042',
    dateLabel: '2026/09/08 — 14:32',
    cashierName: 'عمّار',
    metaLabel: 'محلي',
    items: Array.from({ length: n }, (_, i) => item(i + 1)),
    subtotal: 24 * n,
    discount: 0,
    vat: 3.13 * n,
    total: 24 * n,
    paymentMethodLabel: 'نقداً',
    change: 0,
    customMessage: 'شكراً لزيارتكم',
  };
}

/** أحجامُ الطلبات المقيسة -- من فاتورةِ قهوةٍ واحدة إلى وليمة. */
export const BENCH_SIZES = [1, 10, 30, 100];

export async function runReceiptBench(
  sizes: number[] = BENCH_SIZES,
  theme = 'classic',
  paperWidth: number = DEFAULT_PAPER_WIDTH,
): Promise<BenchRow[]> {
  const { regular, bold, riyalRegular, riyalBold, monoRegular, monoBold } = await loadReceiptTypefaces();
  const provider = buildReceiptFontProvider(regular, bold, riyalRegular, riyalBold, monoRegular, monoBold);
  const measure: Measurer = (t, size, weight, family) => measureTextWidthWeighted(provider, t, size, weight, family);

  const rows: BenchRow[] = [];
  for (const n of sizes) {
    const receipt = benchReceipt(n);

    const t0 = Date.now();
    const layout = layoutReceipt({ receipt, measure, paperWidth, theme, currency: RIYAL });
    const t1 = Date.now();

    const surface = createReceiptSurface(layout.width, layout.height);
    surface.canvas.clear(Skia.Color('#ffffff'));
    const t2 = Date.now();

    paintReceiptOps(surface.canvas, provider, layout, { logo: null, qrPayload: null });
    const t3 = Date.now();

    const rgba = surface.toRgba(layout.height);
    rgbaToEscPosRasterLegacy(rgba);
    const t4 = Date.now();

    rows.push({
      items: n,
      layoutMs: t1 - t0,
      surfaceMs: t2 - t1,
      paintMs: t3 - t2,
      encodeMs: t4 - t3,
      totalMs: t4 - t0,
      height: layout.height,
      ops: layout.ops.length,
      megabytes: (layout.width * layout.height * 4) / 1048576,
    });
  }
  return rows;
}

/**
 * يرسم حالةً مرجعيةً ويُعيدها صورةَ PNG.
 *
 * وهي الحالةُ بعينها التي صوّرها الويبُ في CI -- من
 * `shared/receipt/scenarios.ts` -- وباسمها نفسِه. فتُقارن صورةُ
 * الأيباد بصورة الويب لطلبٍ واحد، لا لطلبين متشابهين.
 *
 * وما تمسكه هذه المقارنةُ لا تمسكه البصماتُ ولا الأرقام: خطُّ الأساس،
 * وارتفاعُ السطر، ومقاييسُ الخطّ، ووصلُ الحروف العربية، والخليطُ
 * العربيُّ الإنجليزيّ في سطرٍ واحد. تلك أشياءُ يقولها الشكلُ ولا
 * يقولها العدد.
 */
export async function renderScenarioPng(scenario: Scenario): Promise<{ id: string; png: string | null; width: number; height: number }> {
  const { regular, bold, riyalRegular, riyalBold, monoRegular, monoBold } = await loadReceiptTypefaces();
  const provider = buildReceiptFontProvider(regular, bold, riyalRegular, riyalBold, monoRegular, monoBold);
  const measure: Measurer = (t, size, weight, family) => measureTextWidthWeighted(provider, t, size, weight, family);
  const paperWidth = scenario.width ?? DEFAULT_PAPER_WIDTH;

  const layout =
    scenario.doc === 'kitchen'
      ? layoutKitchenTicket({ ticket: scenario.model as KitchenTicketModel, measure, paperWidth })
      : scenario.doc === 'shift'
        ? layoutShiftReport({ report: scenario.model as ShiftReportModel, measure, paperWidth, currency: RIYAL })
        : layoutReceipt({ receipt: scenario.model as ReceiptModel, measure, paperWidth, theme: scenario.theme ?? 'classic', currency: RIYAL });

  const surface = createReceiptSurface(layout.width, layout.height);
  surface.canvas.clear(Skia.Color('#ffffff'));
  paintReceiptOps(surface.canvas, provider, layout, { logo: null, qrPayload: null });
  return { id: scenario.id, png: surface.toPngBase64(), width: layout.width, height: layout.height };
}
