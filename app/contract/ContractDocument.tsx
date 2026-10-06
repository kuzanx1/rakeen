import { Clause, ContractOffer, ContractParty, discountOf, featureLabel, firstTermEnd, formatIban, jurisdictionLabel, periodLabel, RAKEEN_PARTY } from "@/lib/contracts";

// The contract as a document — used on the signing page, for the PDF, and
// by the admin panel. Every top-level block carries data-pdf-block so the
// PDF renderer (./pdf.ts) can paginate between blocks instead of slicing
// through a line of text.

export type ContractDocProps = {
  rakeen: typeof RAKEEN_PARTY;
  offer: ContractOffer;
  clauses: Clause[];
  termsVersion: string;
  party?: ContractParty | null;
  signaturePng?: string | null;
  signedAt?: string | null;
  signerIp?: string | null;
  documentHash?: string | null;
};

function fmtDate(iso: string) {
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  return d.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Riyadh" });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Riyadh" });
}

const blank = "—";

// Number isolated LTR in mono, currency label stays in the RTL run.
function Sar({ n }: { n: number }) {
  return (
    <>
      <span className="mono">{Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> ر.س
    </>
  );
}

export default function ContractDocument({ rakeen, offer, clauses, termsVersion, party, signaturePng, signedAt, signerIp, documentHash }: ContractDocProps) {
  const total = offer.price + offer.setup_fee;
  const discount = discountOf(offer);
  return (
    <article className="cdoc">
      <header className="cdoc-head" data-pdf-block>
        <div className="cdoc-head-top">
          <img className="cdoc-logo" src="/brand/rakeen-wordmark-deep.png" alt="ركين" />
          <div className="cdoc-meta">
            <span>رقم العقد</span>
            <b className="mono">{offer.contract_number}</b>
            <span>تاريخ البدء</span>
            <b>{fmtDate(offer.start_date)}</b>
            {offer.business && (
              <>
                <span>مخصص لحساب</span>
                <b>
                  {offer.business.name} · <span className="mono">#{offer.business.id}</span>
                </b>
              </>
            )}
          </div>
        </div>
        <h1 className="cdoc-title">عقد اشتراك في منصة ركين</h1>
        <p className="cdoc-sub">لكل مشروع ناجح، <b>ركن</b> يستند عليه.</p>
      </header>

      <section className="cdoc-block" data-pdf-block>
        <h2>أطراف العقد</h2>
        <div className="cdoc-parties">
          <div className="cdoc-party">
            <h3>الطرف الأول: مقدم الخدمة</h3>
            <dl>
              <dt>الاسم</dt><dd>{rakeen.name} ({rakeen.nameEn})</dd>
              <dt>يمثلها</dt><dd>{rakeen.ownerName}</dd>
              <dt>رقم التسجيل</dt><dd className="mono">{rakeen.registrationNumber}</dd>
              <dt>الموقع</dt><dd className="mono">{rakeen.website}</dd>
              <dt>واتساب</dt><dd className="mono">{rakeen.whatsapp}</dd>
            </dl>
          </div>
          <div className="cdoc-party">
            <h3>الطرف الثاني: المشترك</h3>
            <dl>
              <dt>المنشأة</dt><dd>{party?.business_name || blank}</dd>
              <dt>النشاط والمدينة</dt><dd>{party ? `${party.business_activity} — ${party.city}` : blank}</dd>
              <dt>السجل التجاري</dt><dd className="mono">{party?.cr_number || blank}</dd>
              <dt>الرقم الضريبي</dt><dd className="mono">{party?.vat_number || blank}</dd>
              <dt>يمثلها</dt><dd>{party?.owner_name || blank}</dd>
              <dt>الهوية / الإقامة</dt><dd className="mono">{party?.owner_id_number || blank}</dd>
              <dt>الجوال</dt><dd className="mono">{party?.phone || blank}</dd>
              <dt>البريد</dt><dd className="mono">{party?.email || blank}</dd>
            </dl>
          </div>
        </div>
      </section>

      <section className="cdoc-block" data-pdf-block>
        <h2>الباقة والرسوم</h2>
        <div className="cdoc-offer">
          <div><span>الباقة</span><b>{offer.plan_name}</b></div>
          <div><span>نوع العقد</span><b>{periodLabel(offer.billing_period)}</b></div>
          {discount && (
            <>
              <div><span>السعر الأساسي</span><b className="cdoc-strike"><Sar n={Number(offer.list_price)} /></b></div>
              <div className="cdoc-discount">
                <span>الخصم{offer.discount_label ? ` (${offer.discount_label})` : ""}</span>
                <b><span className="mono">{discount.pct}%</span> · <Sar n={discount.amount} /></b>
              </div>
            </>
          )}
          <div><span>{discount ? "الرسوم بعد الخصم" : "الرسوم"}</span><b><Sar n={offer.price} /> / {offer.billing_period === "annual" ? "سنة" : "شهر"}</b></div>
          {offer.setup_fee > 0 && <div><span>رسوم التأسيس (مرة واحدة)</span><b><Sar n={offer.setup_fee} /></b></div>}
          {offer.setup_fee > 0 && <div><span>المستحق عند التوقيع</span><b><Sar n={total} /></b></div>}
          <div><span>الضريبة</span><b>{offer.vat_mode === "inclusive" ? "شاملة الضريبة" : "غير شاملة الضريبة"}</b></div>
          <div><span>المدة الأولى</span><b>{fmtDate(offer.start_date)} ← {fmtDate(firstTermEnd(offer.start_date, offer.billing_period))}</b></div>
          <div><span>عدد الفروع</span><b className="mono">{offer.branches_count}</b></div>
          <div><span>الاختصاص القضائي</span><b>{jurisdictionLabel(offer.jurisdiction || "taif")}</b></div>
        </div>
      </section>

      {offer.payments && offer.payments.length > 0 && (
        <section className="cdoc-block" data-pdf-block>
          <h2>جدول الدفعات</h2>
          <table className="cdoc-pay">
            <thead>
              <tr><th>الدفعة</th><th>تاريخ الاستحقاق</th><th>المبلغ</th></tr>
            </thead>
            <tbody>
              {offer.payments.map((p) => (
                <tr key={p.seq}>
                  <td className="mono">{p.seq}</td>
                  <td>{fmtDate(p.due_date)}</td>
                  <td><Sar n={p.amount} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>الإجمالي</td>
                <td><Sar n={offer.payments.reduce((s, p) => s + p.amount, 0)} /></td>
              </tr>
            </tfoot>
          </table>
          {rakeen.iban && (
            <div className="cdoc-bank">
              <div><span>البنك</span><b>{rakeen.bankName}</b></div>
              <div><span>رقم الآيبان</span><b className="mono">{formatIban(rakeen.iban)}</b></div>
              <div><span>اسم صاحب الحساب</span><b>{rakeen.accountHolder}</b></div>
            </div>
          )}
        </section>
      )}

      <section className="cdoc-block" data-pdf-block>
        <h2>المزايا المفعّلة</h2>
        <ul className="cdoc-features">
          {offer.features.map((f) => (
            <li key={f}>{featureLabel(f)}</li>
          ))}
        </ul>
      </section>

      {clauses.map((c, i) => (
        <section className="cdoc-clause" key={i} data-pdf-block>
          <h3>
            <span className="cdoc-num mono">{String(i + 1).padStart(2, "0")}</span>
            {c.title}
          </h3>
          {c.body.map((p, j) => (
            <p key={j}>{p}</p>
          ))}
        </section>
      ))}

      <section className="cdoc-block cdoc-sign" data-pdf-block>
        <h2>التوقيع</h2>
        <div className="cdoc-signs">
          <div className="cdoc-signbox">
            <h3>الطرف الأول</h3>
            <p>{rakeen.ownerName}</p>
            <p className="cdoc-signnote">موافق بإصدار هذا العقد عبر منصة ركين</p>
          </div>
          <div className="cdoc-signbox">
            <h3>الطرف الثاني</h3>
            <p>{party?.owner_name || blank}</p>
            {signaturePng ? <img className="cdoc-signature" src={signaturePng} alt="التوقيع" /> : <div className="cdoc-signature-empty" />}
          </div>
        </div>
        {signedAt && (
          <div className="cdoc-evidence">
            <div><span>تاريخ ووقت التوقيع</span><b>{fmtDateTime(signedAt)}</b></div>
            {signerIp && <div><span>عنوان IP</span><b className="mono">{signerIp}</b></div>}
            <div><span>إصدار البنود</span><b className="mono">{termsVersion}</b></div>
            {documentHash && (
              <div className="cdoc-hash"><span>بصمة المستند SHA-256</span><b className="mono">{documentHash}</b></div>
            )}
          </div>
        )}
      </section>

      <footer className="cdoc-foot" data-pdf-block>
        <span>الوضوح اللي كنت تحتاجه</span>
        <span className="mono">{rakeen.website} · {rakeen.instagram} · {rakeen.whatsapp}</span>
      </footer>
    </article>
  );
}
