import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, View } from 'react-native';
import { Text } from './Text';
import { TouchableOpacity } from './tappable';
import { createStyles, fonts, radii, spacing } from './theme';
import { useI18n } from './i18n';
import { NO_PAYMENT_STEERING } from '../platform/storeRules';
import {
  Renewal,
  Subscription,
  fillDays,
  renewalBodyKey,
  renewalLate,
  renewalLoud,
  renewalTitleKey,
  dirMark,
  subscriptionBigKey,
  subscriptionDayMonth,
  subscriptionPillKey,
  subscriptionTone,
  subscriptionWhenKey,
} from '../domain/renewal';
import {
  RenewalOff,
  RenewalState,
  clearRenewalOff,
  dismissRenewalCard,
  dismissRenewalStrip,
  getRenewalOff,
  getRenewalState,
  refreshRenewal,
  subscribeRenewal,
  subscribeRenewalOff,
} from '../application/renewalService';

/**
 * تذكير تجديد الاشتراك.
 *
 * ثلاث قطع متدرّجة، وكلّها تحت قاعدة واحدة: البيع أولاً. لا شيء منها
 * يغطّي زرّ الدفع ولا سلّة الطلب، ولا شيء منها Modal -- نافذتان فوق
 * بعض على iOS تجمّدان التطبيق بصمت (project_rn_modal_stacking_freeze)،
 * والكاشير قد تكون عنده نافذة مفتوحة أصلاً لحظة ما يجي الدور على هذا.
 *
 *   • النقطة  -- تبقى على «المزيد» لين يُرفع الإيصال. بلا مقاطعة.
 *   • البطاقة -- في كلِّ جلسة، لا مرّةً في اليوم.
 *   • الشريط  -- في آخر يومين فقط، أو إذا تأخّر التجديد أو رُفض الإيصال.
 *
 * والإغلاقُ يشيلها من قدّامه الآن، ولا يُسكتها إلى الغد: «لا يمديه
 * يقفلها يعني إذا شافها فقط، لكن مو إنه يخلّيها ما تطلع له» -- فكلُّ
 * عودةٍ للتطبيق من الخلفيّة تُرجعها، ولا تختفي نهائيّاً إلا بتأكيد
 * السداد من لوحة الإدارة. (renewalService.ts: RenewalOff)
 */

const DASHBOARD_URL = 'https://rakeenapp.com/dashboard';
/** نسخ المتاجر لا توجّه أحداً للدفع خارجها (src/platform/storeRules.ts). */
const CAN_STEER = !NO_PAYMENT_STEERING;

function useRenewalState(): RenewalState {
  const [state, setState] = useState<RenewalState>(getRenewalState());
  useEffect(() => {
    const unsub = subscribeRenewal(setState);
    refreshRenewal();
    // بلا مؤقّت: نفس لحظات فحص الإيقاف -- الرجوع للواجهة يكفي، واليوم
    // الجديد يبدأ عند أول فتح على كل حال.
    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active') return;
      // عودةٌ من الخلفيّة = جلسةٌ جديدة: ما أُغلق يرجع.
      clearRenewalOff();
      refreshRenewal();
    });
    return () => {
      unsub();
      sub.remove();
    };
  }, []);
  return state;
}

/** ما أُغلق في هذي الجلسة -- مشتركٌ بين الشريط والبطاقة. */
function useRenewalOff(): RenewalOff {
  const [o, setO] = useState<RenewalOff>(getRenewalOff());
  useEffect(() => subscribeRenewalOff(setO), []);
  return o;
}

export function useRenewal(): Renewal | null {
  return useRenewalState().renewal;
}

/** عدّادُ «المزيد» -- نفسُ القراءة، بلا نافذةِ الستّةِ أيام. */
export function useSubscription(): Subscription | null {
  return useRenewalState().subscription;
}

function titleOf(renewal: Renewal, t: (s: string) => string): string {
  return fillDays(t(renewalTitleKey(renewal)), renewal.days);
}

/** النقطة على تبويب «المزيد». */
export function RenewalDot({ renewal }: { renewal: Renewal | null }) {
  const styles = useStyles();
  if (!renewal) return null;
  return <View style={[styles.dot, renewalLate(renewal) && styles.dotLate]} pointerEvents="none" />;
}

/** الشريط -- آخر يومين فقط. */
export function RenewalStrip({
  renewal,
  onHeight,
}: {
  renewal: Renewal | null;
  /**
   * ارتفاعُ الشريط إلى القشرة.
   *
   * فعلى اللوح يخرج شريطُ الرأس من السياق (position:absolute في App.tsx)
   * ليمتدّ خلفَه عمودُ الطلب إلى أعلى الشاشة، فلا يُزيحه شيءٌ قبله في
   * الشجرة. فيُعطى الرأسُ `top` بقدر هذا الارتفاع، وإلا رُسم الشريط
   * تحته ولم يُرَ على الآيباد أصلاً -- وهو نفسُ ما وقع في كاشير الويب.
   */
  onHeight?: (h: number) => void;
}) {
  const styles = useStyles();
  const { t } = useI18n();
  const closed = useRenewalOff().strip;
  const hidden = !renewal || !renewalLoud(renewal) || closed;
  useEffect(() => {
    if (hidden) onHeight?.(0);
  }, [hidden, onHeight]);
  if (hidden) return null;
  return (
    <View
      style={[styles.strip, renewalLate(renewal) && styles.stripLate]}
      onLayout={e => onHeight?.(e.nativeEvent.layout.height)}>
      <View style={[styles.stripDot, renewalLate(renewal) && styles.stripDotLate]} />
      <Text style={styles.stripTitle} numberOfLines={1}>
        {titleOf(renewal, t)}
      </Text>
      <Text style={styles.stripBody} numberOfLines={1}>
        {t(renewalBodyKey(renewal, CAN_STEER))}
      </Text>
      {CAN_STEER ? (
        <TouchableOpacity
          style={[styles.stripGo, renewalLate(renewal) && styles.stripGoLate]}
          onPress={() => Linking.openURL(DASHBOARD_URL)}>
          <Text style={[styles.stripGoText, renewalLate(renewal) && styles.stripGoTextLate]}>{t('افتح اللوحة')}</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={styles.stripClose}
        onPress={dismissRenewalStrip}>
        <Text style={styles.stripCloseText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * البطاقة -- مرّة في اليوم.
 *
 * وتُعلَّم مقروءةً لحظة ظهورها لا لحظة إغلاقها: كاشير يُقفل التطبيق
 * قبل أن يضغط شيئاً لا يُلاحَق بالبطاقة نفسها كل مرّة يفتحه فيها.
 */
export function RenewalCard({
  renewal,
  endInset = 0,
  /**
   * على اللوح تمتدّ الشاشة خلف الشريط السفلي ليصل عمودُ الطلب إلى
   * الحافّة، فبطاقةٌ عند bottom:16 تقع خلف التبويبات ولا تُرى. تُزاح
   * بقدر ما يحجبه الشريط (useShell().insetBottom).
   */
  bottomInset = 0,
}: {
  renewal: Renewal | null;
  endInset?: number;
  bottomInset?: number;
}) {
  const styles = useStyles();
  const { t } = useI18n();
  const closed = useRenewalOff().card;
  const close = useCallback(() => dismissRenewalCard(), []);
  if (!renewal || closed) return null;

  return (
    <View style={[styles.cardWrap, { end: endInset, bottom: bottomInset + spacing[4] }]} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>{titleOf(renewal, t)}</Text>
          <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.cardClose}>✕</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.cardBody}>{t(renewalBodyKey(renewal, CAN_STEER))}</Text>
        {CAN_STEER ? (
          <View style={styles.cardRow}>
            <TouchableOpacity
              style={styles.cardGo}
              onPress={() => {
                Linking.openURL(DASHBOARD_URL);
                close();
              }}>
              <Text style={styles.cardGoText}>{t('افتح لوحة التحكم')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cardGhost} onPress={close}>
              <Text style={styles.cardGhostText}>{t('ذكّرني بكرة')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.cardGhostWide} onPress={close}>
            <Text style={styles.cardGhostText}>{t('تمام')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/**
 * عدّادُ الاشتراك في «المزيد» -- دائمٌ، هادئ.
 *
 * «المفروض بالمزيد يكون عدّاد على الاشتراك وكم متبقّي» -- والمكانُ
 * نفسُه هو نصفُ الجواب: شاشةُ «المزيد» يفتحها صاحبُ المطعم لا الكاشير
 * في الزحمة، فالرقمُ يقف فيها دائماً بلا أن يقطع بيعاً ولا أن يراه
 * زبون. والشارةُ تقول الحالَ بكلمةٍ واحدة، والزرُّ لا يظهر إلا إذا كان
 * فيه ما يُفعل -- فبطاقةٌ فيها زرٌّ لا لزومَ له تصير جزءاً من الأثاث.
 */
export function SubscriptionCard({ subscription }: { subscription: Subscription | null }) {
  const styles = useStyles();
  const { t } = useI18n();
  if (!subscription) return null;

  const tone = subscriptionTone(subscription);
  const toneText =
    tone === 'late' ? styles.subLate : tone === 'soon' ? styles.subSoon : tone === 'review' ? styles.subReview : styles.subOk;

  const big = dirMark(fillDays(t(subscriptionBigKey(subscription)), Math.abs(subscription.days)));
  const when = t(subscriptionWhenKey(subscription));
  const date = subscription.days === 0 ? '' : ` ${subscriptionDayMonth(subscription.date)}`;
  // والحالُ يُلحق بالسطر الصغير لا بشارةٍ على حدة: شارةٌ في بطاقةٍ
  // ارتفاعُها ثمانون بكسلاً تزاحم العنوان، والكلمةُ تكفي.
  const state = tone === 'ok' ? '' : ` · ${t(subscriptionPillKey(subscription, CAN_STEER))}`;

  return (
    <View style={styles.subCard}>
      <View style={styles.subRow}>
        <Text style={styles.subLabel}>{t('اشتراكك')}</Text>
        <Text style={[styles.subNum, toneText]}>{big}</Text>
      </View>
      <Text style={styles.subWhen}>{`${when}${date}${state}`}</Text>
    </View>
  );
}

const INK = '#111410';
const PAPER = '#FBFAF5';
const LIME = '#C4FF2B';
const AMBER = '#FFC24B';
/**
 * شريطٌ أحمرُ كامل، لا خطٌّ أحمرُ تحت شريطٍ أسود.
 *
 * قرارُ المالك: «إذا ما تسبب مشاكل المفروض الشريط يكون بالأحمر». وخطٌّ
 * بعرضِ بكسلين تحت شريطٍ حِبريٍّ لا يُقرأ أحمرَ أصلاً -- رأيتُه في
 * الصورة فغيّرتُه. والنصُّ ورقيٌّ على الأحمر (٥٫٦:١)، وزرُّ اللوحة
 * ينقلب ورقيّاً بنصٍّ أحمر حتى لا يذوب الكهرمانيُّ في الأحمر.
 */
const DANGER_BG = '#A33A25';
const DANGER_LINE = '#F0B3A4';

const useStyles = createStyles(colors => ({
  // فوق الأيقونة وإلى طرفها، داخل مرساةٍ بحجمها (App.tsx navTabIcon).
  dot: {
    position: 'absolute' as const,
    top: -3,
    end: -4,
    width: 9,
    height: 9,
    borderRadius: 99,
    backgroundColor: AMBER,
  },

  strip: {
    flexShrink: 0,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    backgroundColor: INK,
    borderBottomWidth: 2,
    borderBottomColor: AMBER,
  },
  stripLate: { backgroundColor: DANGER_BG, borderBottomColor: DANGER_LINE },
  stripGoLate: { backgroundColor: PAPER },
  stripGoTextLate: { color: DANGER_BG },
  stripDot: { width: 8, height: 8, borderRadius: 99, backgroundColor: AMBER },
  stripDotLate: { backgroundColor: PAPER },
  /* من السمة لا ثابتاً: النقطةُ تقع على شريطِ التبويبات، وخلفيّتُه
     ورقيّةٌ في الفاتح وحِبريّةٌ في الداكن -- فلونٌ واحدٌ يضيع في أحدهما. */
  dotLate: { backgroundColor: colors.danger },
  stripTitle: { fontFamily: fonts.sansBold, fontSize: 13, color: PAPER, flexShrink: 0 },
  stripBody: { fontFamily: fonts.sansMedium, fontSize: 12, color: 'rgba(251,250,245,0.6)', flex: 1 },
  stripGo: { backgroundColor: AMBER, borderRadius: radii.sm, paddingHorizontal: spacing[3], paddingVertical: 6 },
  stripGoText: { fontFamily: fonts.sansBold, fontSize: 12, color: '#0B0B0A' },
  stripClose: { paddingHorizontal: spacing[1] },
  stripCloseText: { fontFamily: fonts.sansBold, fontSize: 14, color: 'rgba(251,250,245,0.42)' },

  // فوق المحتوى، تحت أي نافذة -- وما توصل زرّ الدفع: السلّة على الطرف
  // الآخر، والبطاقة محصورة في وسط الشاشة بعرضٍ محدود.
  cardWrap: {
    position: 'absolute' as const,
    start: 0,
    end: 0,
    bottom: spacing[4],
    alignItems: 'center' as const,
    zIndex: 40,
  },
  card: {
    width: '92%' as const,
    maxWidth: 440,
    backgroundColor: INK,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(196,255,43,0.22)',
    padding: spacing[5],
  },
  cardHead: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: spacing[2] },
  cardTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: PAPER, flex: 1, lineHeight: 24 },
  cardClose: { fontFamily: fonts.sansBold, fontSize: 15, color: 'rgba(251,250,245,0.36)' },
  cardBody: {
    fontFamily: fonts.sansRegular,
    fontSize: 13.5,
    lineHeight: 23,
    color: 'rgba(251,250,245,0.68)',
    marginTop: spacing[2],
    marginBottom: spacing[4],
  },
  cardRow: { flexDirection: 'row' as const, gap: spacing[2] },
  cardGo: {
    flex: 1,
    backgroundColor: LIME,
    borderRadius: radii.md,
    paddingVertical: spacing[3],
    alignItems: 'center' as const,
  },
  cardGoText: { fontFamily: fonts.sansBold, fontSize: 14, color: '#0B0B0A' },
  cardGhost: {
    borderRadius: radii.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderWidth: 1,
    borderColor: 'rgba(251,250,245,0.16)',
    alignItems: 'center' as const,
  },
  cardGhostWide: {
    borderRadius: radii.md,
    paddingVertical: spacing[3],
    borderWidth: 1,
    borderColor: 'rgba(251,250,245,0.16)',
    alignItems: 'center' as const,
  },
  cardGhostText: { fontFamily: fonts.sansMedium, fontSize: 13, color: 'rgba(251,250,245,0.6)' },

  /**
   * عدّادُ «المزيد» -- بطاقةٌ مصغّرة (اختيارُ المالك من ثلاثةِ بدائل).
   *
   * وكانت بطاقةً كاملةً برقمٍ من ٤٤ نقطة: «حسّيتها كبيرة». وهي صادقة --
   * حجمُها كان حجمَ بطاقةِ الوردية، وليست بأهميّتها: الورديةُ عملٌ يُفعل
   * الآن، والاشتراكُ خبرٌ يُطمأنّ إليه. فصار الرقمُ ٢١ نقطةً جنبَ
   * العنوان، والحالُ كلمةً في السطر الصغير، بلا زرٍّ ولا شارة.
   *
   * والزرُّ لم يُفقد: ساعةَ يلزم فعلٌ يطلع الشريطُ والبطاقةُ فوق ومعهما
   * «افتح لوحة التحكم» -- فلا داعي لزرٍّ ثالثٍ هنا طولَ الشهر.
   */
  subCard: {
    backgroundColor: colors.cardBg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 15,
    paddingHorizontal: 18,
    marginTop: 12,
  },
  /* يلتفُّ سطرين في عمودٍ ضيّقٍ بدل أن ينكسرَ الرقمُ نصفين: «4 أيام
     تأخير» في عمودِ ١٥٦ بكسل كانت تصير فقرةً، وقصُّ العنوانِ بدلَها
     يُخفي «اشتراكك» كلَّها. ونفسُه في rakeen-pos-additions.css. */
  subRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: spacing[2], flexWrap: 'wrap' as const },
  subLabel: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text, flexGrow: 1, flexShrink: 0 },
  subNum: { fontFamily: fonts.sansBold, fontSize: 21 },
  subWhen: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.muted, marginTop: 3 },
  // الليمونيُّ على الفاتح ١٫٩:١ -- رقمٌ لا يُقرأ. و«ساري» لا يحتاج لوناً
  // أصلاً: ما فيه ما يُنبَّه له.
  subOk: { color: colors.text },
  subSoon: { color: colors.amber },
  subLate: { color: colors.danger },
  subReview: { color: colors.muted },
}));
