import type { Metadata } from "next";
import AdminDashboard from "./AdminDashboard";

export const metadata: Metadata = {
  title: "لوحة إدارة ركين",
};

// The server HTML of this page is an empty cream box (the session check
// runs in the browser). If the JS bundle never runs (a browser too old for
// it, a blocked chunk, a crash before mount) that box stays forever and the
// owner sees "a white page" with no clue. This watchdog is plain ES5 so it
// runs on any browser: it records the first error, and if the app has not
// mounted after 12s it prints the reason and the browser version.
const BOOT_WATCHDOG = `(function(){
  var errs=[];
  window.addEventListener('error',function(e){errs.push((e.message||'')+(e.filename?' @ '+e.filename.split('/').pop()+':'+e.lineno:''));},true);
  window.addEventListener('unhandledrejection',function(e){var r=e.reason;errs.push('promise: '+(r&&r.message?r.message:String(r)));});
  setTimeout(function(){
    if(window.__rkAdminReady)return;
    var d=document.createElement('div');
    d.setAttribute('dir','rtl');
    d.style.cssText='position:fixed;inset:0;z-index:99999;background:#F6F4EC;color:#171717;font-family:sans-serif;padding:32px;overflow:auto';
    var h=document.createElement('h2');h.textContent='لوحة الإدارة ما اشتغلت على هذا المتصفح';
    var p=document.createElement('p');p.textContent='صوّر هذي الشاشة وأرسلها للدعم.';
    var pre=document.createElement('pre');pre.setAttribute('dir','ltr');
    pre.style.cssText='white-space:pre-wrap;background:#fff;padding:16px;border-radius:12px;font-size:13px';
    var nl=String.fromCharCode(10);
    pre.textContent='Browser: '+navigator.userAgent+nl+nl+'Errors:'+nl+(errs.length?errs.slice(0,8).join(nl):'(none recorded)');
    d.appendChild(h);d.appendChild(p);d.appendChild(pre);document.body.appendChild(d);
  },12000);
})();`;

export default function AdminPage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: BOOT_WATCHDOG }} />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@600;700&display=swap" />
      <AdminDashboard />
    </>
  );
}
