/**
 * يبني محرّكَ الطباعة للويب.
 *
 * التطبيقُ يستورد `shared/receipt` مباشرةً. والويبُ لا يقدر: ملفُّ
 * الكاشير يُقدَّم نصّاً خاماً بلا حزمٍ ولا وحدات، فلا `import` فيه.
 * فيُبنى له من المصدر نفسِه ملفٌّ واحد يُحمَّل قبله.
 *
 * ومصدرُ الاثنين واحد. وطزاجةُ المبنيّ يحرسها اختبار (`--check`)، فلا
 * يقع ما كان يقع: تعديلٌ في مكانٍ ونسيانٌ في الآخر، والورقتان تفترقان
 * بلا أن يشتكي شيء.
 *
 *   node scripts/build-receipt-engine.mjs          يبني
 *   node scripts/build-receipt-engine.mjs --check  يتحقّق ولا يكتب
 */

import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolve(root, 'shared/receipt/index.ts');
const OUT = resolve(root, 'public/pos/receipt-engine.js');

const BANNER = `/* مولَّد -- لا يُحرَّر. المصدر: shared/receipt/
   يُعاد بناؤه بـ: npm run receipt:build */`;

async function bundle() {
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'iife',
    globalName: 'RakeenReceiptEngine',
    // أجهزةُ الكاشير فيها أيبادُ قديم -- والهدفُ أدنى ممّا نكتب به.
    target: ['es2017'],
    charset: 'utf8',
    write: false,
    banner: { js: BANNER },
    legalComments: 'none',
  });
  return result.outputFiles[0].text;
}

const built = await bundle();

/**
 * المقارنةُ على المحتوى لا على نهايات الأسطر.
 *
 * فgit على ويندوز يقلب LF إلى CRLF عند السحب، والبناءُ يكتب LF -- فلو
 * قُورنا حرفاً بحرف لَصرخ الحارسُ بعد كلّ عمليةِ git ولا شيءَ تغيّر،
 * ثم يُتجاهَل صراخُه حين يتغيّر شيءٌ حقاً.
 */
const norm = (s) => s.replace(/\r\n/g, '\n');

if (process.argv.includes('--check')) {
  const current = await readFile(OUT, 'utf8').catch(() => null);
  if (current === null || norm(current) !== norm(built)) {
    console.error('محرّكُ الطباعة المبنيّ للويب قديم.');
    console.error('عُدّل shared/receipt/ ولم يُعَد البناء. شغّل: npm run receipt:build');
    process.exit(1);
  }
  console.log('محرّكُ الطباعة للويب مطابقٌ لمصدره.');
} else {
  await writeFile(OUT, built, 'utf8');
  console.log(`بُني: public/pos/receipt-engine.js (${(built.length / 1024).toFixed(1)}ك)`);
}
