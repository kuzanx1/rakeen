/**
 * هل يملك خطٌّ محزومٌ كلَّ محرفٍ تطبعه الفاتورة؟
 *
 * وهذا الاختبارُ وُلد من خطأ. قِستُ رمزَ العملة في المتصفّح فبدا أنّ
 * الخطَّ يملكه، فبنيتُ عليه -- والمتصفّحُ كان يستعيره من خطوط ويندوز
 * ولا يقول. وعلى الأيباد لا شيءَ يُستعار منه: كان يخرج مربّعاً فارغاً
 * في كلّ سطرٍ ماليّ، ولا شيءَ في المعاينة يقول إنّه فارغ.
 *
 * فلا يُسأل المتصفّحُ ولا Skia: يُقرأ جدولُ cmap من ملفّ الخطّ نفسِه.
 * وهو الحقُّ الذي لا احتياطيَّ فيه -- إمّا أن يكون المحرفُ في الملفّ
 * أو لا يكون.
 */

/* eslint-disable @typescript-eslint/no-var-requires */

/** يُعيد رقمَ الرسم للمحرف، أو صفراً إن لم يملكه الخطّ. */
function glyphIdFor(file: string, codepoint: number): number {
  const fs = require('fs');
  // بلا أنواع node في هذا المشروع: التوصيفُ موضعيٌّ لما يُستعمل فقط.
  const b: { readUInt16BE(o: number): number; readInt16BE(o: number): number; readUInt32BE(o: number): number; toString(enc: string, a: number, b: number): string } = fs.readFileSync(file);

  let cmapOff: number | null = null;
  const numTables = b.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    if (b.toString('ascii', o, o + 4) === 'cmap') cmapOff = b.readUInt32BE(o + 8);
  }
  if (cmapOff == null) return 0;

  // جدولُ الشكل ٤ على منصّة ويندوز -- وهو الذي تقرؤه المحرّكاتُ كلُّها.
  let sub: number | null = null;
  const n = b.readUInt16BE(cmapOff + 2);
  for (let i = 0; i < n; i++) {
    const rec = cmapOff + 4 + i * 8;
    const pid = b.readUInt16BE(rec);
    const eid = b.readUInt16BE(rec + 2);
    const off = cmapOff + b.readUInt32BE(rec + 4);
    if (b.readUInt16BE(off) === 4 && pid === 3 && (eid === 1 || eid === 10)) sub = off;
  }
  if (sub == null) return 0;

  const segX2 = b.readUInt16BE(sub + 6);
  const segs = segX2 / 2;
  const endO = sub + 14;
  const startO = endO + segX2 + 2;
  const deltaO = startO + segX2;
  const rangeO = deltaO + segX2;

  for (let s = 0; s < segs; s++) {
    const end = b.readUInt16BE(endO + s * 2);
    if (codepoint > end) continue;
    const start = b.readUInt16BE(startO + s * 2);
    if (codepoint < start) return 0;
    const delta = b.readInt16BE(deltaO + s * 2);
    const ro = b.readUInt16BE(rangeO + s * 2);
    if (ro === 0) return (codepoint + delta) & 0xffff;
    const g = b.readUInt16BE(rangeO + s * 2 + ro + (codepoint - start) * 2);
    return g === 0 ? 0 : (g + delta) & 0xffff;
  }
  return 0;
}

const FONTS = {
  arabic: 'Tajawal-Regular.ttf',
  arabicBold: 'Tajawal-Bold.ttf',
  riyal: 'SaudiRiyal-Regular.ttf',
  riyalBold: 'SaudiRiyal-Bold.ttf',
  mono: 'IBMPlexMono-Medium.ttf',
};

function assetPath(name: string): string {
  const { resolve } = require('path');
  // jest يعمل من جذر مشروع التطبيق، فالمسارُ منه لا من موضع الملفّ --
  // وأنواعُ node ليست هنا حتى يُستعمل __dirname.
  return resolve('assets', 'fonts', name);
}

/** يبحث في الخطوط المحزومة كلِّها -- Skia تلتمس المحرفَ فيها بالترتيب. */
function anyBundledFontHas(codepoint: number): string | null {
  for (const [role, file] of Object.entries(FONTS)) {
    if (glyphIdFor(assetPath(file), codepoint) !== 0) return role;
  }
  return null;
}

const RIYAL = '⃁';

describe('محارف الفاتورة موجودةٌ في خطٍّ محزوم', () => {
  it('رمز العملة ⃁ في خطّ الريال', () => {
    // ولو غاب لَخرج مربّعاً فارغاً في كلّ سطرٍ ماليّ على الجهاز، وعلى
    // الويب لَاستعاره من خطّ النظام فاختلفت الورقتان.
    expect(anyBundledFontHas(RIYAL.codePointAt(0) as number)).toBe('riyal');
  });

  it('الخطّ العربيّ لا يملكه -- فالالتماسُ في خطّ الريال ضرورة لا زينة', () => {
    expect(glyphIdFor(assetPath(FONTS.arabic), 0x20c1)).toBe(0);
  });

  it('﷼ (U+FDFC) ليس في أيّ خطّ محزوم -- ولذلك لا يُطبع', () => {
    // ظننتُه يصلح فبنيتُ عليه، وكان المتصفّحُ يستعيره من ويندوز.
    // هذا الاختبارُ يمنع أن يعود.
    expect(anyBundledFontHas(0xfdfc)).toBeNull();
  });

  it('حروف العربية والأرقام في الخطّ العربيّ', () => {
    for (const ch of 'أبجدهوزحطيكلمنسعفصقرشتثخذضظغ٠١٢٣٤٥٦٧٨٩0123456789.،') {
      expect({ ch, has: glyphIdFor(assetPath(FONTS.arabic), ch.codePointAt(0) as number) !== 0 })
        .toEqual({ ch, has: true });
    }
  });

  it('أرقام المبالغ في الخطّ الأحاديّ العرض', () => {
    for (const ch of '0123456789.,+-') {
      expect({ ch, has: glyphIdFor(assetPath(FONTS.mono), ch.codePointAt(0) as number) !== 0 })
        .toEqual({ ch, has: true });
    }
  });

  it('الحروف اللاتينية للأسماء الإنجليزية', () => {
    for (const ch of 'ABCXYZabcxyz') {
      expect({ ch, has: glyphIdFor(assetPath(FONTS.arabic), ch.codePointAt(0) as number) !== 0 })
        .toEqual({ ch, has: true });
    }
  });

  it('المحارف الثابتة في نصوص الفاتورة', () => {
    // النقطةُ الفاصلة بين العربيّ والإنجليزيّ، والشَرطةُ الطويلة،
    // والضربُ في سطر سعر الوحدة، والشَرطةُ أمام الإضافات.
    for (const ch of '·—×|') {
      expect({ ch, has: glyphIdFor(assetPath(FONTS.arabic), ch.codePointAt(0) as number) !== 0 })
        .toEqual({ ch, has: true });
    }
  });
});
