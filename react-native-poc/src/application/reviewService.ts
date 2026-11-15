import { Platform } from 'react-native';
import InAppReview from 'react-native-in-app-review';
import { getItem, setItem } from '../infrastructure/mmkvStorage';
import { installedFromPlay } from './appUpdateService';

/**
 * «قيّم ركين» بعد أول طلب بالكاشير.
 *
 * نافذة التقييم الرسمية من أبل وقوقل (داخل التطبيق، بلا خروج). أبل ما تقبل
 * نافذة تقييم من صنعنا (5.6.1)، وكل نظام يقرّر بنفسه يعرضها ولا لا -- لها
 * حدّ مرات بالسنة، فما نسأل إلا مرة وحدة بهالجهاز.
 *
 * أندرويد من الرابط المباشر: ما فيه تقييم (التقييم في بلاي لمن نزّله منه).
 */
const ASKED_KEY = 'rk_review_asked_v1';
let asking = false;

export async function maybeAskForReview(): Promise<void> {
  if (asking) return;
  if (Platform.OS === 'android' && !installedFromPlay()) return;
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
  asking = true;
  try {
    if ((await getItem(ASKED_KEY).catch(() => null)) === '1') return;
    if (!InAppReview.isAvailable()) return;
    await setItem(ASKED_KEY, '1');
    // بعد ما تخلص شاشة نجاح الدفع، مو فوقها.
    await new Promise<void>(r => setTimeout(r, 2500));
    await InAppReview.RequestInAppReview();
  } catch {
    // ما طلع؟ عادي -- النظام يقرّر.
  } finally {
    asking = false;
  }
}
