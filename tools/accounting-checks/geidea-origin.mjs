/* جيديا ترفض callbackUrl يبدأ بـ http:// («Invalid callback url» 110/009)، فكان
   ربط المفاتيح يفشل برسالة «تأكد من المفتاح» والمفتاح سليم. الرابط يُبنى الآن
   من الـ Host وبـ https دائماً. */
import fs from "node:fs";
import { geideaPublicOrigin } from "../../lib/geidea.ts";

let fails = 0;
const ok = (name, cond) => { console.log((cond ? "✓ " : "✗ ") + name); if (!cond) fails++; };

console.log("=== العنوان العام ===");
ok("متجر فرعي ← https", geideaPublicOrigin("hbiah.rakeenapp.com", "http://hbiah.rakeenapp.com") === "https://hbiah.rakeenapp.com");
ok("النطاق الأساسي ← https", geideaPublicOrigin("rakeenapp.com", "http://rakeenapp.com") === "https://rakeenapp.com");
ok("المنفذ يُحذف", geideaPublicOrigin("rakeenapp.com:443", "x") === "https://rakeenapp.com");
ok("حروف كبيرة", geideaPublicOrigin("HBIAH.RakeenApp.com", "x") === "https://hbiah.rakeenapp.com");
ok("نطاق غريب لا يُستعمل (لا يُوجَّه الدفع لغيرنا)", geideaPublicOrigin("evil.com", "https://evil.com") === "https://rakeenapp.com");
ok("نطاق ينتهي بالاسم بلا نقطة لا يُقبل", geideaPublicOrigin("notrakeenapp.com", "x") === "https://rakeenapp.com");
ok("بلا Host", geideaPublicOrigin(null, "http://x") === "https://rakeenapp.com");
ok("التطوير المحلي يبقى كما هو", geideaPublicOrigin("localhost:3000", "http://localhost:3000") === "http://localhost:3000");

console.log("\n=== المساران يستعملانه ===");
for (const f of ["app/api/dashboard/geidea/credentials/route.ts", "app/api/payments/geidea/create-session/route.ts"]) {
  const s = fs.readFileSync(f, "utf8");
  ok(f.split("/").slice(-2, -1)[0] + ": يبني الرابط بـ geideaPublicOrigin", s.includes("geideaPublicOrigin(request.headers.get(\"host\")") && !s.includes("const origin = request.nextUrl.origin"));
}
ok("شاشة الربط تعرض رد جيديا لصاحب المتجر",
  fs.readFileSync("app/api/dashboard/geidea/credentials/route.ts", "utf8").includes("رد جيديا"));

console.log("\n" + (fails === 0 ? "كل الحالات صحيحة ✓" : fails + " خلل ✗"));
process.exit(fails ? 1 : 0);
