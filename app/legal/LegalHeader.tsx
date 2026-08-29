export default function LegalHeader() {
  return (
    <div className="legal-top">
      <a href="/" className="legal-back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 8 12l10 6" />
        </svg>
        العودة للرئيسية
      </a>
      <img src="/brand/rakeen-wordmark.png" alt="ركين" className="legal-logo" />
    </div>
  );
}
