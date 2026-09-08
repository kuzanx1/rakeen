import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * حارسُ المصدر الواحد.
 *
 * التطبيقُ يستورد `shared/receipt/` مباشرةً، والويبُ يقرأ ملفاً مبنيّاً
 * منه -- فالمصدرُ واحدٌ ما دام المبنيُّ يتبعه. ولو نُسي البناءُ مرّةً
 * لَعاد ما جُمع فافترق: التطبيقُ يطبع الجديد والويبُ يطبع القديم، ولا
 * شيءَ يشتكي، فالورقتان تُطبعان كلتاهما.
 *
 * فيُفحص هنا مع كلّ اختبار: أُعيد البناءُ أم لا. والفشلُ يقول ما يُفعل.
 */
describe('محرّك الطباعة المشترك', () => {
  it('الملفّ المبنيّ للويب مطابقٌ لمصدره', () => {
    const root = resolve(__dirname, '..', '..');
    expect(() =>
      execFileSync('node', ['scripts/build-receipt-engine.mjs', '--check'], {
        cwd: root,
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });
});
