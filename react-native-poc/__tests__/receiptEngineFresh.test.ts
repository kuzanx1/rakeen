/**
 * حارسُ المصدر الواحد.
 *
 * التطبيقُ يستورد `shared/receipt/` مباشرةً، والويبُ يقرأ ملفاً مبنيّاً
 * منه -- فالمصدرُ واحدٌ ما دام المبنيُّ يتبعه. ولو نُسي البناءُ مرّةً
 * لَعاد ما جُمع فافترق: التطبيقُ يطبع الجديد والويبُ يطبع القديم، ولا
 * شيءَ يشتكي، فالورقتان تُطبعان كلتاهما.
 *
 * فيُفحص هنا مع كلّ اختبار: أُعيد البناءُ أم لا. والفشلُ يقول ما يُفعل.
 *
 * والاستدعاءُ بـrequire لا import: هذا مشروعُ React Native، وأنواعُ
 * node ليست في مساره -- فلا يُثقَل tsconfig بها لأجل ملفِّ اختبارٍ واحد.
 */
/* eslint-disable @typescript-eslint/no-var-requires */

// أنواعُ node ليست في مسار هذا المشروع؛ وهذان كلُّ ما يلزم منها هنا.
declare const __dirname: string;

describe('محرّك الطباعة المشترك', () => {
  it('الملفّ المبنيّ للويب مطابقٌ لمصدره', () => {
    const { execFileSync } = require('child_process');
    const { resolve } = require('path');
    const root = resolve(__dirname, '..', '..');
    expect(() =>
      execFileSync('node', ['scripts/build-receipt-engine.mjs', '--check'], {
        cwd: root,
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });
});
