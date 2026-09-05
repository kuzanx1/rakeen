import { EscPosText } from './escposText';
import { writeColumns, itemColumns, estimateDots } from './escposColumns';
import { PrinterCapabilityProfile, arabicLineFor } from './printerCapability';
import { ReceiptModel, ORDER_KIND_LABEL } from './receiptModel';
import { rgbaToEscPosRaster, rgbaToEscPosRasterLegacy, RgbaBuffer } from './escposRaster';

/**
 * A ReceiptModel printed as ESC/POS, at the best fidelity this printer
 * supports.
 *
 * Three strategies, chosen per capability rather than per printer:
 *
 *   FAST      text + native QR + native barcode + cached logo
 *   PARTIAL   text + Arabic runs rasterised + native QR + cached logo
 *   FALLBACK  the whole receipt rasterised (owned by the Skia renderer,
 *             not this module)
 *
 * Full raster is never the default. It was, and on a SUNMI NT310 that
 * cost 45 seconds a receipt against Foodics' one on the same machine —
 * not because images are heavy but because handing a printer a page-sized
 * bitmap asks it to do the one thing it is slowest at.
 *
 * INFORMATION ORDER, and why:
 *   who sold it → which sale → what was bought → what it cost →
 *   how it was paid → proof
 * A customer checking a receipt reads the total first and the header
 * almost never; a cashier resolving a dispute reads the order number
 * first. So the order number is the largest thing in the header block and
 * the total is the largest thing on the receipt, and everything else is
 * quieter than both. Nothing is centred except the header and the footer,
 * because a centred line in the middle of a table breaks the scan.
 */

const ESC_GS = 0x1d;

/** Latin digits everywhere. An Arabic-Indic digit run comes back reordered
 *  on a shaping-only printer, and a price that prints 15.00 as 00.51 is
 *  worse than a slow receipt. */
function money(n: number): string {
  return n.toFixed(2);
}

/**
 * ملصق بلغة واحدة.
 *
 * الملصق ثنائي اللغة يحتاج فاصلاً، والفاصل رمز لا ينتمي لأي من اللغتين
 * فموضعه بعد المرآة يتأرجح بين طرفي الحدّ اللغوي. الغموض في المحتوى لا
 * في الخوارزمية، فيُزال من المحتوى.
 *
 * أسماء المنتجات تبقى كما يكتبها صاحب المطعم — قد تكون ثنائية، وهي
 * مقطع واحد يُعالَج صحيحاً.
 */
function label(ar: string, en: string): string {
  return LANG === 'en' ? en : ar;
}

/** لغة الفاتورة. تُمرَّر من الأعلى؛ العربية هي الأصل. */
let LANG: 'ar' | 'en' = 'ar';
export function setReceiptLanguage(lang: 'ar' | 'en'): void {
  LANG = lang;
}

/** `GS ( k` Model-2 QR: model → module size → correction → store → print. */
function qrCommands(payload: string): number[] {
  const data: number[] = [];
  for (const ch of payload) data.push(ch.charCodeAt(0) & 0xff);
  const len = data.length + 3;
  return [
    ESC_GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,
    ESC_GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06,
    ESC_GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31,
    ESC_GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30, ...data,
    ESC_GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30,
  ];
}

/** `GS k` CODE128, height 60 dots, HRI text below. */
function barcodeCommands(value: string): number[] {
  const data: number[] = [];
  for (const ch of value) data.push(ch.charCodeAt(0) & 0xff);
  return [
    ESC_GS, 0x68, 0x3c,             // height 60 dots
    ESC_GS, 0x77, 0x02,             // module width 2
    ESC_GS, 0x48, 0x02,             // HRI below the bars
    ESC_GS, 0x6b, 0x49, data.length + 2, 0x7b, 0x42, ...data,
  ];
}

/**
 * A hairline rule, as one dot row of graphics.
 *
 * A row of "-" is what a receipt looks like when nobody chose anything:
 * the dashes are as tall as the text, they leave gaps, and they read as
 * typing rather than as a rule. One dot row reads as a printed line, which
 * is what Foodics' slip has and what makes its blocks look deliberate.
 *
 * The cost is 89 bytes and it is identical on every receipt, so it is
 * built once per width and reused — a rule is not worth re-encoding six
 * times a receipt, several receipts a minute.
 */
const hairlineCache = new Map<number, number[]>();

function hairline(caps: PrinterCapabilityProfile): number[] {
  const cached = hairlineCache.get(caps.printableDots);
  if (cached) return cached;
  const width = caps.printableDots;
  // Through the same encoder as everything else, so an old printer still
  // gets the command form it understands.
  const row = rowToRgba(width);
  const bytes = caps.modernGraphics ? rgbaToEscPosRaster(row) : rgbaToEscPosRasterLegacy(row);
  hairlineCache.set(width, bytes);
  return bytes;
}

/**
 * One pixel row, at the given dot density.
 *
 * `every = 1` is a solid rule; `every = 2` prints every other dot and
 * reads as a fine dotted line. The second is what separates items from
 * each other, so that a section boundary and an item boundary do not look
 * like the same thing.
 */
function rowToRgba(width: number, every = 1): RgbaBuffer {
  const data = new Uint8Array(width * 4);
  for (let i = 0; i < width; i++) {
    const on = i % every === 0;
    data[i * 4] = on ? 0 : 255;
    data[i * 4 + 1] = on ? 0 : 255;
    data[i * 4 + 2] = on ? 0 : 255;
    data[i * 4 + 3] = 255;
  }
  return { width, height: 1, data };
}

/** The lighter rule that separates one item from the next. */
const dottedCache = new Map<number, number[]>();

function dottedLine(caps: PrinterCapabilityProfile): number[] {
  const cached = dottedCache.get(caps.printableDots);
  if (cached) return cached;
  const row = rowToRgba(caps.printableDots, 2);
  const bytes = caps.modernGraphics ? rgbaToEscPosRaster(row) : rgbaToEscPosRasterLegacy(row);
  dottedCache.set(caps.printableDots, bytes);
  return bytes;
}

/** Logo bytes, encoded once per logo and reused for every receipt. */
const logoCache = new Map<string, number[]>();

export function cacheLogo(key: string, buffer: RgbaBuffer, caps: PrinterCapabilityProfile): void {
  logoCache.set(key, caps.modernGraphics ? rgbaToEscPosRaster(buffer) : rgbaToEscPosRasterLegacy(buffer));
}

export function clearLogoCache(): void {
  logoCache.clear();
}

export function isLogoCached(key: string): boolean {
  return logoCache.has(key);
}

/** Arabic runs a text-only printer cannot render, for the caller to raster. */
export interface UnprintableRun {
  text: string;
  /** Where it belongs, so the caller can splice a strip in. */
  index: number;
}

export interface RenderResult {
  bytes: number[];
  /** Non-empty only on an `arabic: 'none'` printer — the PARTIAL strategy's
   *  work list. Empty means the whole receipt printed as text. */
  needsRaster: UnprintableRun[];
  strategy: 'fast' | 'partial';
}

export function renderReceipt(model: ReceiptModel, caps: PrinterCapabilityProfile): RenderResult {
  const t = new EscPosText();
  const col = itemColumns(caps);
  const needsRaster: UnprintableRun[] = [];
  let lineIndex = 0;

  /** A centred line, or a raster request when this printer cannot set it. */
  const centre = (text: string, opts?: { bold?: boolean; tall?: boolean }) => {
    const prepared = arabicLineFor(text, caps);
    lineIndex++;
    if (prepared === null) {
      needsRaster.push({ text, index: lineIndex });
      return;
    }
    t.align('center');
    if (opts?.tall) t.size(0, 1);
    if (opts?.bold) t.bold(true);
    t.line(prepared);
    if (opts?.bold) t.bold(false);
    if (opts?.tall) t.size(0, 0);
  };

  /**
   * A money row: the number hard against the left edge, the label at the
   * right. The number column is narrow on purpose — every value in it is
   * a price, and a narrow column is what makes them read as one stack.
   */
  const moneyRow = (label: string, value: string, bold = false) => {
    lineIndex++;
    writeColumns(t, [
      { text: value, x: 0, width: col.price.width, align: 'right', bold },
      { text: label, x: col.name.x, width: col.name.width, align: 'right', bold },
    ], caps);
  };

  /**
   * An order-info row: label at the right, value flowing left across
   * everything that is left.
   *
   * Separate from moneyRow because its values are not numbers. Putting a
   * date or a customer name into the narrow price column overran it,
   * pushed the label off the paper, and the printer wrapped the remainder
   * — the line was not "misaligned", it was two lines pretending to be one.
   */
  const infoRow = (label: string, value: string) => {
    lineIndex++;
    const labelW = Math.round(caps.printableDots * 0.3);
    writeColumns(t, [
      { text: value, x: 0, width: caps.printableDots - labelW - Math.round(caps.printableDots * 0.03), align: 'right' },
      { text: label, x: caps.printableDots - labelW, width: labelW, align: 'right' },
    ], caps);
  };

  const rule = () => {
    lineIndex++;
    t.feedDots(6).align('left').raw(hairline(caps)).feedDots(8);
  };

  /**
   * رقم الطلب داخل إطار.
   *
   * هو أول ما يبحث عنه الكاشير في نزاع، وأول ما يقرأه العميل ليطابق
   * طلبه. خطّان شعريان حوله يجعلانه كتلة قائمة بذاتها بدل سطر عريض بين
   * سطور — وهذا ما يفعله فودكس، وهو صحيح.
   */
  // خط علوي فقط. التاريخ يأتي تحت الرقم، ويغلق الكتلةَ فاصلُ القسم
  // بعده -- وخطّ سفلي هنا كان يحبس التاريخ بين خطين فيقرأ قسماً قائماً
  // بذاته لا تتمّةً للرقم الذي فوقه.
  const framed = (small: string, big: string) => {
    t.feedDots(7).align('left').raw(hairline(caps)).feedDots(11);
    centre(small);
    t.feedDots(3);
    centre(big, { bold: true, tall: true });
    t.feedDots(6);
    lineIndex += 1;
  };

  /**
   * السلوقن: مركزي، بمتّسع فوقه وتحته.
   *
   * والتباعد بين حروفه للاتيني وحده. طلبُ "خط عرض" جميل بالإنجليزية،
   * ومدمّر بالعربية: حروفها تتصل، وزيادة المسافة تفكّ الوصل فتصير
   * الكلمة حروفاً متناثرة.
   */
  const tagline = (text: string) => {
    const latinOnly = !/[؀-ۿ]/.test(text);
    t.feedDots(6);
    if (latinOnly) t.charSpacing(3);
    centre(text);
    if (latinOnly) t.charSpacing(0);
    t.feedDots(4);
  };

  // ---- Header ---------------------------------------------------------
  // شعار الفاتورة وحده. غيابه يعني الاسم فقط، ولا يرتدّ إلى شعار المتجر:
  // من ترك خانة "شعار الفاتورة" فارغة اختار ألّا يطبع شعاراً.
  const logo = model.logoKey ? logoCache.get(model.logoKey) : undefined;
  if (logo) {
    t.align('center').raw(logo).feedDots(10);
  }
  centre(model.businessName, { bold: true, tall: true });
  if (model.tagline) tagline(model.tagline);

  // أين نحن، سطر واحد. واسم الفرع يتقدّمه فقط حين تتعدد الفروع -- وهو
  // ما يقرّره المُحوّل بعدّ الفروع، لا العارض بالتخمين.
  const where = [model.branchLabel, model.locationLine].filter(Boolean).join(' — ');
  if (where) centre(where);
  const contact = [model.addressLine, model.phone].filter(Boolean).join('  ');
  if (contact) centre(contact);

  if (model.vatNumber) {
    t.feedDots(4);
    centre(label('فاتورة ضريبية مبسطة', 'Simplified Tax Invoice'));
    centre(`${label('الرقم الضريبي', 'VAT')} ${model.vatNumber}`);
  }

  // لا فاصل هنا: الإطار حول رقم الطلب يحمل خطه العلوي بنفسه، وخطان
  // متجاوران يقرأان كخطأ طباعة.

  // ---- Order ----------------------------------------------------------
  // The order number is the one thing a cashier looks for first, so it is
  // the largest line in this block rather than another grey label.
  // الرقم وحده كبيراً، وملصقه صغيراً فوقه. الرقم هو ما يُبحث عنه، فلا
  // تزاحمه كلمة بنفس حجمه.
  framed(label('رقم الطلب', 'Order No'), `#${model.orderNumber}`);

  // التاريخ والوقت مركزيان تحت الرقم: هما تتمّة كتلته، وجعلهما صفّاً
  // معنوناً يفتح عموداً لا يملؤه غيرهما.
  centre(model.timeLabel ? `${model.dateLabel}   ${model.timeLabel}` : model.dateLabel);

  rule();

  // من أصدرها ونوعها. صفّان معنونان لأن لهما ما بعدهما في نفس العمود.
  if (model.cashierName) infoRow(label('تمت بواسطة', 'Served by'), model.cashierName);
  // اسم تطبيق التوصيل يتقدّم على النوع العام حين يوجد: "هنقرستيشن"
  // تقول ما لا تقوله "توصيل".
  const kind = model.orderKind ? ORDER_KIND_LABEL[model.orderKind] : null;
  const kindText = model.orderKindLabel ?? (kind ? label(kind.ar, kind.en) : null);
  if (kindText) {
    infoRow(
      label('نوع الطلب', 'Type'),
      model.tableNumber ? `${kindText} — ${label('طاولة', 'Table')} ${model.tableNumber}` : kindText,
    );
  } else if (model.tableNumber) {
    infoRow(label('طاولة', 'Table'), model.tableNumber);
  }
  if (model.customerName) infoRow(label('العميل', 'Customer'), model.customerName);
  if (model.customerPhone) infoRow(label('الجوال', 'Phone'), model.customerPhone);

  rule();

  // ---- Items ----------------------------------------------------------
  lineIndex++;
  writeColumns(t, [
    // العملة في عنوان العمود لا في كل سطر: تكرارها اثنتي عشرة مرة يملأ
    // أضيق عمود في الورقة ويدفع الأرقام إلى القصّ، والعمود المعنون
    // يقول ما تقوله المرة الواحدة.
    { text: label('السعر ريال', 'Price SAR'), x: col.price.x, width: col.price.width, align: 'right' },
    { text: label('المنتج', 'Item'), x: col.name.x, width: col.name.width, align: 'right' },
    { text: label('كمية', 'Qty'), x: col.qty.x, width: col.qty.width, align: 'right' },
  ], caps);
  rule();

  model.items.forEach((item, itemIndex) => {
    // فاصل بين الأصناف لا قبل أولها ولا بعد آخرها: الأول يفصله عنوان
    // الأعمدة، والأخير يغلقه خط القسم.
    if (itemIndex > 0) {
      t.feedDots(5).align('left').raw(dottedLine(caps)).feedDots(7);
      lineIndex++;
    }
    lineIndex++;
    writeColumns(t, [
      { text: money(item.lineTotal), x: col.price.x, width: col.price.width, align: 'right', bold: true },
      { text: item.name, x: col.name.x, width: col.name.width, align: 'right', bold: true },
      { text: String(item.qty), x: col.qty.x, width: col.qty.width, align: 'right' },
    ], caps);

    // الاسم الإنجليزي سطراً تحته، لا بجانبه بفاصل.
    //
    // فودكس يكتبهما على سطر واحد يفصلهما "|"، وهو ممكن عندهم لأنهم
    // يرسلون صورة. أما هنا فالمحرف المحايد بين مقطعين بلغتين يتأرجح
    // موضعه بعد ترتيب المقاطع، فيقع مرة يمين العربي ومرة يسار الإنجليزي
    // بلا قاعدة. سطران يزيلان السؤال كله.
    if (item.nameEn) {
      lineIndex++;
      writeColumns(t, [
        { text: item.nameEn, x: col.name.x, width: col.name.width, align: 'right' },
      ], caps);
    }

    // The unit price only earns a line when quantity is more than one; at
    // one it repeats the number already printed beside it.
    if (item.qty > 1) {
      lineIndex++;
      writeColumns(t, [
        { text: `${money(item.unitPrice)} x ${item.qty}`, x: col.name.x, width: col.name.width, align: 'right' },
      ], caps);
    }

    // Modifiers are indented and carry their own price, so an add-on can
    // never be mistaken for a product or lost inside one.
    for (const mod of item.modifiers) {
      lineIndex++;
      const indent = col.name.x;
      writeColumns(t, [
        ...(mod.amount !== 0
          ? [{ text: money(mod.amount), x: col.price.x, width: col.price.width, align: 'right' as const }]
          : []),
        { text: `+ ${mod.label}`, x: indent, width: col.name.width - Math.round(caps.printableDots * 0.04), align: 'right' as const },
      ], caps);
    }

    // الملاحظة تحمل اسمها. اسم المنتج عريض ويقابله سعر؛ والإضافة تبدأ
    // بعلامة زائد؛ أما الملاحظة فكانت سطراً عربياً عادياً لا يميّزه عن
    // اسم منتج شيء إلا غياب السعر. الخط الأصغر كان سيفصلها بلا كلمات،
    // لكن Font B لم يُختبر عربياً على هذي الطابعة، ولن أرسل غير مُختبر
    // إلى طابعة تعمل. فالكلمة تفعل ما يفعله الخط، بما هو مُثبت.
    if (item.note) {
      lineIndex++;
      const noteIndent = Math.round(caps.printableDots * 0.06);
      writeColumns(t, [
        { text: `${label('ملاحظات', 'Notes')}: ${item.note}`,
          x: col.name.x, width: col.name.width - noteIndent, align: 'right' },
      ], caps);
    }
  });

  rule();

  // ---- Money ----------------------------------------------------------
  moneyRow(label('المجموع الفرعي', 'Subtotal'), money(model.subtotal));
  if (model.discount > 0) moneyRow(label('الخصم', 'Discount'), `-${money(model.discount)}`);
  for (const charge of model.charges) moneyRow(charge.label, money(charge.amount));
  moneyRow(label('ضريبة القيمة المضافة', 'VAT'), money(model.vat));

  // The total is the only line printed double-height. It is what the
  // customer checks and the only number worth finding without reading.
  lineIndex++;
  // الرقم الذي يُراجَع ويُعترض عليه، فيُذكر باسم عملته كاملاً. وعموده
  // موسَّع لهذا السطر وحده -- عمود الأسعار ضيّق بحساب الأرقام وحدها،
  // وإضافة كلمة إليه كما هو تُقصّ الكلمة أو الرقم.
  const totalW = Math.round(caps.printableDots * 0.34);
  t.size(0, 1);
  writeColumns(t, [
    { text: `${money(model.total)} ${label('ريال', 'SAR')}`, x: 0, width: totalW, align: 'right', bold: true },
    { text: label('الإجمالي', 'Total'), x: totalW + Math.round(caps.printableDots * 0.03),
      width: caps.printableDots - totalW - Math.round(caps.printableDots * 0.06), align: 'right', bold: true },
  ], caps);
  t.size(0, 0);

  rule();

  // ---- Payment --------------------------------------------------------
  // طريقة الدفع في عمود الأرقام لا في عمود المعلومات: السطور الثلاثة
  // متجاورة، وحافة واحدة تجعلها كتلة تُقرأ دفعةً بدل ثلاث كتل.
  moneyRow(label('الدفع', 'Payment'), model.paymentMethodLabel);
  if (model.paidAmount != null) moneyRow(label('المدفوع', 'Paid'), money(model.paidAmount));
  if (model.change > 0) moneyRow(label('الباقي', 'Change'), money(model.change));

  // ---- Proof ----------------------------------------------------------
  if (model.qrPayload && caps.nativeQr) {
    t.align('center').line();
    t.raw(qrCommands(model.qrPayload));
    t.line();
  }
  if (model.barcodeValue && caps.nativeBarcode) {
    t.align('center').line();
    t.raw(barcodeCommands(model.barcodeValue));
    t.line();
  }

  // فاصل يُغلق كتلة الأرقام قبل الخاتمة، وإلا التصقت "شكراً لزيارتكم"
  // بآخر مبلغ وبدت سطراً من الحساب.
  // الخاتمة أسطر لا سطر: "مدة الجلوس ٦٠ دقيقة للطاولة" ثم "شكراً
  // لزيارتكم" جملتان لكل منهما وقعها، ودمجهما في سطر يطمس الأولى.
  // ويُقصّ الفارغ حتى لا يطبع سطر بياض من ضغطة Enter زائدة.
  const closing = (model.customMessage ?? '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (closing.length > 0) {
    rule();
    for (const line of closing) centre(line);
  }

  t.feed(3);
  if (caps.supportsCut) t.cut();

  return {
    bytes: t.build(),
    needsRaster,
    strategy: needsRaster.length === 0 ? 'fast' : 'partial',
  };
}

/** Exposed for the layout tests, which assert dot positions not spaces. */
export const _internals = { estimateDots, itemColumns };
