import { BillingPeriod, featureLabel, periodLabel, RAKEEN_PARTY, VatMode } from "@/lib/contracts";

// A price quote ("عرض سعر") — same data the admin enters for a contract,
// rendered as a sales document. Every top-level block carries
// data-pdf-block so ./pdf.ts paginates between blocks, exactly like the
// contract. Nothing here is stored: the quote is generated on demand.

export type QuoteProps = {
  quoteNumber: string;
  issuedAt: string; // ISO
  validDays: number;
  clientName: string;
  contactName: string;
  phone: string;
  planName: string;
  billingPeriod: BillingPeriod;
  price: number; // after discount
  listPrice?: number | null; // before discount, when there is one
  discountLabel?: string;
  setupFee: number;
  vatMode: VatMode;
  branchesCount: number;
  features: string[];
  notes: string;
  acceptQrDataUrl: string | null;
};

function fmtDate(d: Date) {
  return d.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Riyadh" });
}

function Sar({ n }: { n: number }) {
  return (
    <>
      <span className="mono">{Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> ر.س
    </>
  );
}

export default function QuoteDocument(q: QuoteProps) {
  const issued = new Date(q.issuedAt);
  const validUntil = new Date(issued.getTime() + q.validDays * 86_400_000);
  const annual = q.billingPeriod === "annual";
  const per = annual ? "سنة" : "شهر";
  const firstPayment = q.price + q.setupFee;
  const notes = q.notes.trim() ? q.notes.trim().split(/\n+/).map((l) => l.trim()).filter(Boolean) : [];

  return (
    <article className="cdoc qt">
      <header className="cdoc-head" data-pdf-block>
        <div className="cdoc-head-top">
          <img className="cdoc-logo" src="/brand/rakeen-wordmark-deep.png" alt="ركين" />
          <div className="cdoc-meta">
            <span>رقم العرض</span>
            <b className="mono">{q.quoteNumber}</b>
            <span>التاريخ</span>
            <b>{fmtDate(issued)}</b>
            <span>صالح حتى</span>
            <b>{fmtDate(validUntil)}</b>
          </div>
        </div>
        <h1 className="cdoc-title">عرض سعر</h1>
        <p className="cdoc-sub">لكل مشروع ناجح، <b>ركن</b> يستند عليه.</p>
      </header>

      <section className="cdoc-block" data-pdf-block>
        <div className="cdoc-parties">
          <div className="cdoc-party">
            <h3>مقدّم إلى</h3>
            <dl>
              <dt>المنشأة</dt><dd>{q.clientName || "—"}</dd>
              <dt>المسؤول</dt><dd>{q.contactName || "—"}</dd>
              <dt>الجوال</dt><dd className="mono">{q.phone || "—"}</dd>
            </dl>
          </div>
          <div className="cdoc-party">
            <h3>من</h3>
            <dl>
              <dt>الاسم</dt><dd>{RAKEEN_PARTY.name} ({RAKEEN_PARTY.nameEn})</dd>
              <dt>الموقع</dt><dd className="mono">{RAKEEN_PARTY.website}</dd>
              <dt>واتساب</dt><dd className="mono">{RAKEEN_PARTY.whatsapp}</dd>
            </dl>
          </div>
        </div>
      </section>

      <section className="cdoc-block" data-pdf-block>
        <h2>الباقة والسعر</h2>
        <div className="qt-price">
          <div className="qt-price-main">
            <span className="qt-plan">{q.planName}</span>
            {q.listPrice && q.listPrice > q.price && (
              <span className="qt-was">
                <s><Sar n={q.listPrice} /></s> خصم <Sar n={q.listPrice - q.price} />{q.discountLabel ? ` · ${q.discountLabel}` : ""}
              </span>
            )}
            <span className="qt-amount"><Sar n={q.price} /> <i>/ {per}</i></span>
            {annual && <span className="qt-eq">ما يعادل <Sar n={q.price / 12} /> شهريًا</span>}
          </div>
          <div className="qt-price-rows">
            <div><span>نوع الاشتراك</span><b>{periodLabel(q.billingPeriod)}، يتجدد تلقائيًا</b></div>
            <div><span>عدد الفروع</span><b className="mono">{q.branchesCount}</b></div>
            {q.setupFee > 0 && <div><span>رسوم التأسيس (مرة واحدة)</span><b><Sar n={q.setupFee} /></b></div>}
            <div className="qt-total"><span>أول دفعة</span><b><Sar n={firstPayment} /></b></div>
            <div><span>الضريبة</span><b>{q.vatMode === "inclusive" ? "الأسعار شاملة الضريبة" : "تُضاف ضريبة القيمة المضافة متى كانت مستحقة"}</b></div>
          </div>
        </div>
      </section>

      <section className="cdoc-block" data-pdf-block>
        <h2>المزايا المشمولة</h2>
        <ul className="cdoc-features">
          {q.features.map((f) => (
            <li key={f}>{featureLabel(f)}</li>
          ))}
        </ul>
        <div className="qt-included">
          <span>ومعها:</span> الدعم الفني بالواتساب · تجهيز النظام معك خطوة بخطوة · تحديثات المنصة
        </div>
      </section>

      {notes.length > 0 && (
        <section className="cdoc-block" data-pdf-block>
          <h2>ملاحظات العرض</h2>
          {notes.map((n, i) => (
            <p key={i} className="qt-note">{n}</p>
          ))}
        </section>
      )}

      <section className="cdoc-block" data-pdf-block>
        <h2>الشروط</h2>
        <ul className="qt-terms">
          <li>هذا العرض صالح حتى {fmtDate(validUntil)}.</li>
          <li>الأسعار بالريال السعودي، والرسوم تُدفع مقدمًا في بداية كل {per}.</li>
          <li>يخضع الاشتراك لعقد اشتراك منصة ركين، ويُوقّع إلكترونيًا من الجوال.</li>
        </ul>
      </section>

      <section className="cdoc-block qt-accept" data-pdf-block>
        <div>
          <h2>للموافقة على العرض</h2>
          <p>امسح الرمز أو تواصل معنا على واتساب <b className="mono">{RAKEEN_PARTY.whatsapp}</b>، ونرسل لك رابط العقد توقّعه من جوالك.</p>
        </div>
        {q.acceptQrDataUrl && <img className="qt-qr" src={q.acceptQrDataUrl} alt="" />}
      </section>

      <footer className="cdoc-foot" data-pdf-block>
        <span>الوضوح اللي كنت تحتاجه</span>
        <span className="mono">{RAKEEN_PARTY.website} · {RAKEEN_PARTY.instagram} · {RAKEEN_PARTY.whatsapp}</span>
      </footer>
    </article>
  );
}
