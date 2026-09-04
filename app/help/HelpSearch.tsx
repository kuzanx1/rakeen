"use client";

import { useMemo, useRef, useState } from "react";

type SearchItem = {
  id: string;
  kicker: string;
  title: string;
  snippet: string;
  keywords: string[];
};

// One entry per question in HelpPage.tsx — keep in sync with the sections
// there (same id). keywords cover synonyms/typos/related terms someone
// might type instead of the exact question wording ("نداء" for the pager
// question, "فلوس" for refund, "PIN" for the manager code, etc).
const ITEMS: SearchItem[] = [
  { id: "pos", kicker: "نقطة البيع", title: "كيف يدخل الكاشير النظام أول مرة؟", snippet: "رمز الفرع، تجهيز الجهاز، الدخول بإيميل المدير أول مرة.", keywords: ["دخول", "تسجيل", "رمز", "PIN", "جهاز", "تجهيز", "كاشير", "لوقن", "login"] },
  { id: "pos-offline", kicker: "نقطة البيع", title: "وش يصير لو انقطعت الشبكة وأنا أبيع؟", snippet: "الطلب يُحفظ محليًا ويتزامن تلقائيًا لما يرجع النت.", keywords: ["نت", "انترنت", "شبكة", "اوفلاين", "offline", "انقطاع", "مزامنة", "sync"] },
  { id: "pos-pager", kicker: "نقطة البيع", title: "كيف أفعّل أجهزة النداء (الباجر) وأربطها بالكاشير؟", snippet: "تفعيل من إعدادات الكاشير ← أنواع الطلبات.", keywords: ["نداء", "باجر", "buzzer", "جرس", "استدعاء", "pager"] },
  { id: "pos-dine-in-mode", kicker: "نقطة البيع", title: "كيف أختار بين وضع الطاولات الكامل ووضع الطلب المحلي البسيط؟", snippet: "محلي بسيط بدون طاولات، أو خدمة طاولات كاملة مع حجوزات.", keywords: ["طاولات", "حجز", "حجوزات", "محلي", "بسيط", "جلسات"] },
  { id: "pos-refund", kicker: "نقطة البيع", title: "كيف أسترجع مبلغ طلب سابق؟", snippet: "زر استرجاع مبلغ من تفاصيل الطلب، يحتاج موافقة المدير.", keywords: ["استرجاع", "استرداد", "فلوس", "الغاء", "ريفند", "refund", "مسترجع"] },
  { id: "pos-manager-pin", kicker: "نقطة البيع", title: "رمز الموافقة اللي يطلبه الاسترجاع، وين أضبطه؟", snippet: "كلمة سر المدير — رمز منفصل تمامًا عن رمز الفرع.", keywords: ["مدير", "صلاحية", "كلمة سر", "رمز المدير", "موافقة", "manager pin"] },
  { id: "kitchen", kicker: "المطبخ", title: "وش الفرق بين حالات الطلبات اللي أشوفها بشاشة المطبخ؟", snippet: "طاولات، تطبيقات توصيل، استلام (سفري) — وطلبات المتجر الإلكتروني.", keywords: ["مطبخ", "طلبات", "حالات", "توصيل", "سفري", "استلام", "kitchen", "شاشة المطبخ"] },
  { id: "kitchen-ready-mode", kicker: "المطبخ", title: "وين أبدّل بطاقة المطبخ من يدوي إلى تختفي تلقائيًا؟", snippet: "إعدادات الكاشير ← شاشة المطبخ.", keywords: ["يدوي", "تلقائي", "تم التجهيز", "بطاقة", "اختفاء"] },
  { id: "branches", kicker: "الفروع والموظفين", title: "كيف أضيف موظف وأربطه برمز دخول الكاشير؟", snippet: "تفعيل الكاشير لهذا الموظف من نموذج إضافة موظف.", keywords: ["موظف", "اضافة موظف", "كاشير", "ربط", "اسم كاشير"] },
  { id: "employee-compliance", kicker: "الفروع والموظفين", title: "كيف أضيف تنبيه لانتهاء إقامة أو وثيقة موظف؟", snippet: "الامتثال والوثائق — إقامة، عقد عمل، شهادة صحية، تأمين.", keywords: ["اقامة", "وثيقة", "تنبيه", "انتهاء", "هوية", "عقد", "تأمين", "امتثال"] },
  { id: "storefront", kicker: "المتجر الإلكتروني", title: "كيف أفعّل المتجر الإلكتروني؟", snippet: "التفعيل الأول من فريق ركين، وبعدها الإعدادات بيدك.", keywords: ["متجر", "الكتروني", "تفعيل", "رابط", "اونلاين", "online store"] },
  { id: "storefront-geidea", kicker: "المتجر الإلكتروني", title: "كيف أخلي عملاء متجري يدفعون بالبطاقة أونلاين؟", snippet: "ربط حساب Geidea — بطاقة الدفع بالمتجر الإلكتروني بس.", keywords: ["دفع", "بطاقة", "فيزا", "مدى", "بوابة دفع", "geidea", "جيديا", "اونلاين دفع"] },
  { id: "inventory", kicker: "المخزون", title: "كيف يوصل المخزون بوصفة المنتج تلقائيًا؟", snippet: "ربط صنف مخزون بمنتج عبر وصفة — خصم تلقائي مع كل بيع.", keywords: ["مخزون", "وصفة", "نقص", "خصم مخزون", "مكونات"] },
  { id: "inventory-invoice-scan", kicker: "المخزون", title: "أقدر أسجّل فاتورة مورّد بالكاميرا بدل ما أكتبها يدويًا؟", snippet: "صوّر الفاتورة — قراءة تلقائية للمورّد والأصناف والأسعار.", keywords: ["فاتورة", "مورد", "كاميرا", "مسح", "scan", "OCR", "مشتريات"] },
  { id: "products", kicker: "المنتجات", title: "منتج زي البوكس محتواه يتغيّر كل طلب — كيف أحسب تكلفته؟", snippet: "وضع بوكس/تركيبة متغيرة — أفضل وأسوأ حالة للتكلفة.", keywords: ["بوكس", "تركيبة", "تكلفة", "box", "منتج متغير"] },
  { id: "products-modifiers", kicker: "المنتجات", title: "كيف أضيف إضافات بسعر مختلف عن تكلفتها الحقيقية؟", snippet: "مجموعات الخيارات — سعر العميل منفصل عن تكلفتك.", keywords: ["اضافات", "خيارات", "حجم", "مقبلات", "modifier", "جبن اضافي"] },
  { id: "accounting", kicker: "الأرباح والضريبة", title: "من وين تجي أرقام الربح والضريبة اللي أشوفها؟", snippet: "مبيعات الكاشير، تكلفة المخزون، عمولات التوصيل، والضريبة.", keywords: ["ارباح", "ربح", "ضريبة", "محاسبة", "صافي الربح"] },
  { id: "accounting-delivery-platform", kicker: "الأرباح والضريبة", title: "كيف أضيف منصة توصيل وأربط عمولتها بأرباحي؟", snippet: "عمولة، رسوم توصيل، وأقصى وقت تجهيز.", keywords: ["توصيل", "عمولة", "هنقرستيشن", "جاهز", "منصة", "delivery"] },
  { id: "accounting-daily-report", kicker: "الأرباح والضريبة", title: "فيه تقرير يومي يتولّد لي وحده؟", snippet: "يتولّد كل ليلة الساعة ١٢، تتحكم بمحتواه.", keywords: ["تقرير", "يومي", "تلقائي", "تقارير"] },
  { id: "accounting-vat-return", kicker: "الأرباح والضريبة", title: "وش الفرق بين تقرير الضريبة والإقرار الضريبي؟", snippet: "الإقرار يطرح ضريبة المدخلات — صافي المستحق الفعلي.", keywords: ["ضريبة", "اقرار", "زكاة", "vat", "ضريبة المدخلات"] },
  { id: "accounting-whatsapp", kicker: "الأرباح والضريبة", title: "أقدر أسأل عن مبيعاتي بواتساب؟", snippet: "ربط واتساب — بوت يجاوبك عن مبيعاتك وطلباتك ومخزونك.", keywords: ["واتساب", "whatsapp", "بوت", "تنبيهات", "اشعارات"] },
  { id: "loyalty", kicker: "الولاء", title: "كيف أفعّل نظام الولاء وأعدّل نسب الخصم؟", snippet: "مفتاح تشغيل/إيقاف، نقاط تلقائية، ومستويات Bronze إلى Platinum.", keywords: ["ولاء", "نقاط", "خصم", "عضوية", "loyalty", "مستويات"] },
];

// Diacritics/alef/ة-normalization so "الكاشير" and "كاشير" (or a query with
// stray tashkeel) compare equal — without this, most real Arabic typing
// variance would silently miss obvious matches.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآا]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[] = Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

function fieldScore(fieldNorm: string, queryWords: string[]): number {
  let score = 0;
  for (const w of queryWords) {
    if (!w) continue;
    if (fieldNorm.includes(w)) {
      score += fieldNorm.startsWith(w) ? 14 : 10;
      continue;
    }
    // typo tolerance: compare against each word in the field
    const fieldWords = fieldNorm.split(/\s+/);
    let best = Infinity;
    for (const fw of fieldWords) {
      if (Math.abs(fw.length - w.length) > 2) continue;
      const d = levenshtein(w, fw);
      if (d < best) best = d;
    }
    if (best <= 2 && w.length >= 3) score += 5 - best;
  }
  return score;
}

function search(query: string): SearchItem[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored = ITEMS.map((item) => {
    const titleN = normalize(item.title);
    const kickerN = normalize(item.kicker);
    const snippetN = normalize(item.snippet);
    const keywordsN = item.keywords.map(normalize).join(" ");
    const score =
      fieldScore(titleN, words) * 2 +
      fieldScore(keywordsN, words) * 1.6 +
      fieldScore(kickerN, words) * 1.2 +
      fieldScore(snippetN, words);
    return { item, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 7)
    .map((s) => s.item);
}

export default function HelpSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => search(query), [query]);

  return (
    <div className="help-search" ref={boxRef}>
      <div className="help-search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        <input
          type="text"
          placeholder="دوّر عن أي شي — مثلاً: كاشير، استرجاع، واتساب..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {query && (
          <button type="button" className="help-search-clear" onClick={() => { setQuery(""); setOpen(false); }} aria-label="امسح البحث">✕</button>
        )}
      </div>
      {open && query.trim() && (
        <div className="help-search-results">
          {results.length === 0 ? (
            <div className="help-search-empty">ما لقينا شي يطابق "{query}" — جرّب كلمة ثانية.</div>
          ) : (
            results.map((r) => (
              <a key={r.id} href={`#${r.id}`} className="help-search-result" onClick={() => setOpen(false)}>
                <div className="help-search-result-kicker">{r.kicker}</div>
                <div className="help-search-result-title">{r.title}</div>
                <div className="help-search-result-snippet">{r.snippet}</div>
              </a>
            ))
          )}
        </div>
      )}
    </div>
  );
}
