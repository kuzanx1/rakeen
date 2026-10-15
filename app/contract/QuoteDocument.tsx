import type { ReactNode } from "react";
import { BankDetails, BillingPeriod, featureLabel, formatIban, periodLabel, RAKEEN_PARTY, VatMode } from "@/lib/contracts";

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
  // The same schedule the contract would get (buildSchedule, or the admin's
  // hand edits), so the quote's numbers never disagree with the contract's.
  payments?: { amount: number; due_date: string }[];
  bank?: BankDetails | null;
};

function monthsBetween(a: string, b: string) {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

function everyLabel(months: number) {
  if (months === 1) return "شهريًا";
  if (months === 12) return "سنويًا";
  if (months === 2) return "كل شهرين";
  return `كل ${months} أشهر`;
}

// What follows the first payment, as one line in the price box: the quote has
// to stay a single A4 page, and a typical quote already measured 266mm of the
// 261mm a page has, so this can't be a table or its own section. Returns null
// when there's nothing to add (one upfront payment, or a plain monthly
// subscription, which the "/ شهر" price already says).
function afterFirst(payments: { amount: number; due_date: string }[], annual: boolean): ReactNode {
  const rest = payments.slice(1);
  if (rest.length === 0) return null;
  const sameAmount = rest.every((p) => Math.abs(p.amount - rest[0].amount) < 0.005);
  const gaps = rest.map((p, i) => monthsBetween(payments[i].due_date, p.due_date));
  const step = gaps.every((g) => g === gaps[0] && g > 0) ? gaps[0] : null;
  if (sameAmount && step) {
    if (!annual && step === 1) return null;
    return <><span className="mono">{rest.length}</span> × <Sar n={rest[0].amount} /> {everyLabel(step)}</>;
  }
  // hand-edited into something irregular: say how many and how much in total
  return <><span className="mono">{rest.length}</span> دفعات بمجموع <Sar n={rest.reduce((t, p) => t + p.amount, 0)} /></>;
}

function branchesLabel(n: number) {
  if (n <= 1) return "فرع واحد";
  if (n === 2) return "فرعين";
  return n <= 10 ? `${n} فروع` : `${n} فرعًا`;
}

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
  const payments = (q.payments || []).filter((p) => Number.isFinite(p.amount) && p.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.due_date));
  // Was always price + setup fee, which overstated it whenever an annual
  // price was split into instalments: the contract's first instalment is a
  // fraction of that.
  const firstPayment = payments.length > 0 ? payments[0].amount : q.price + q.setupFee;
  const instalments = annual && payments.length > 1;
  const then = afterFirst(payments, annual);
  const bank = q.bank && q.bank.iban ? q.bank : null;
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
              <dt>رقم التسجيل</dt><dd className="mono">{RAKEEN_PARTY.registrationNumber}</dd>
              <dt>واتساب</dt><dd className="mono">{RAKEEN_PARTY.whatsapp}</dd>
            </dl>
          </div>
        </div>
      </section>

      <section className="cdoc-block" data-pdf-block>
        <h2>الباقة والسعر</h2>
        <div className="qt-price">
          <div className="qt-price-main">
            <span className="qt-plan">{q.planName} · {branchesLabel(q.branchesCount)}</span>
            {q.listPrice && q.listPrice > q.price && (
              <span className="qt-was">
                <s><Sar n={q.listPrice} /></s> خصم <Sar n={q.listPrice - q.price} />{q.discountLabel ? ` · ${q.discountLabel}` : ""}
              </span>
            )}
            <span className="qt-amount"><Sar n={q.price} /> <i>/ {per}</i></span>
            {then ? (
              <span className="qt-eq">الأولى <Sar n={firstPayment} /> ثم {then}</span>
            ) : (
              annual && <span className="qt-eq">ما يعادل <Sar n={q.price / 12} /> شهريًا</span>
            )}
          </div>
          <div className="qt-price-rows">
            <div><span>نوع الاشتراك</span><b>{periodLabel(q.billingPeriod)}، يتجدد تلقائيًا</b></div>
            {q.setupFee > 0 && <div><span>رسوم التأسيس (مرة واحدة)</span><b><Sar n={q.setupFee} /></b></div>}
            <div className="qt-total"><span>{instalments ? "الدفعة الأولى" : "أول دفعة"}</span><b><Sar n={firstPayment} /></b></div>
            <div><span>الضريبة</span><b>{q.vatMode === "inclusive" ? "الأسعار شاملة الضريبة" : "تُضاف ضريبة القيمة المضافة متى كانت مستحقة"}</b></div>
          </div>
        </div>
      </section>

      <section className="cdoc-block" data-pdf-block>
        <h2>المزايا المشمولة</h2>
        {/* 15+ features is the one list that can push a quote onto a second page */}
        <ul className={q.features.length > 14 ? "cdoc-features qt-dense" : "cdoc-features"}>
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
          <li>
            {instalments
              ? "الأسعار بالريال السعودي، وتُدفع كل دفعة في موعدها حسب التقسيط الموضح أعلاه."
              : `الأسعار بالريال السعودي، والرسوم تُدفع مقدمًا في بداية كل ${per}.`}
          </li>
          <li>يخضع الاشتراك لعقد اشتراك منصة ركين، ويُوقّع إلكترونيًا من الجوال.</li>
        </ul>
      </section>

      <section className="cdoc-block qt-accept" data-pdf-block>
        <div>
          <h2>للموافقة على العرض</h2>
          <p>امسح الرمز أو تواصل معنا على واتساب <b className="mono">{RAKEEN_PARTY.whatsapp}</b>، ونرسل لك رابط العقد توقّعه من جوالك.</p>
          {bank && (
            <p className="qt-bank">
              <span>الدفع بتحويل بنكي:</span> {bank.bankName} · <b className="mono">{formatIban(bank.iban)}</b> · باسم {bank.accountHolder}
            </p>
          )}
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
