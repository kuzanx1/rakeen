import LandingPage from "./landing/LandingPage";

/* رابط «نسيت كلمة المرور» يرجع لـ /dashboard. لكن لو لم يكن /dashboard في
   قائمة روابط Supabase المسموحة، يرجعه Supabase لعنوان الموقع الأساسي --
   هنا -- ومعه #access_token…&type=recovery. فيُحوَّل للوحة بنفس الـ hash،
   ولا يضيع الرابط على الصفحة الرئيسية. */
const forwardRecovery =
  "(function(){var h=location.hash;if(/[#&](type=recovery|error_code=)/.test(h))location.replace('/dashboard'+h);})();";

export default function Home() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: forwardRecovery }} />
      <LandingPage />
    </>
  );
}
