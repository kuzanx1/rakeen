// يشتغل تلقائياً قبل cf:deploy (precf:deploy في package.json).
//
// سكربتات public/ (اللوحة، الكاشير، المتجر…) ملفات خام ما يمرّ عليها
// أي build، فخطأ صياغة واحد فيها يوقف الصفحة كاملة عند كل العملاء ولا
// شي يعترض. صار فعلاً (2026-11-07): سطر جديد حقيقي داخل نص '…' في
// rakeen-dashboard.js نزل للإنتاج وأوقف لوحة التحكم ~١٥ دقيقة.
// هذا يرفض النشر لو أي ملف .js تحت public/ فيه خطأ صياغة.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'public');
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
    else if (e.name.endsWith('.js') && !e.name.endsWith('.min.js')) files.push(p);
  }
})(root);

const bad = [];
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (err) { bad.push(f + '\n' + String(err.stderr || err.message).split('\n').slice(0, 4).join('\n')); }
}
if (bad.length) {
  console.error('\n✖ النشر متوقف: خطأ صياغة في سكربتات public/\n\n' + bad.join('\n\n') + '\n');
  process.exit(1);
}
console.log(`✓ ${files.length} سكربت في public/ سليمة الصياغة`);
