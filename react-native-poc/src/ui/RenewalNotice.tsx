import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, View } from 'react-native';
import { Text } from './Text';
import { TouchableOpacity } from './tappable';
import { createStyles, fonts, radii, spacing } from './theme';
import { useI18n } from './i18n';
import { NO_PAYMENT_STEERING } from '../platform/storeRules';
import {
  Renewal,
  fillDays,
  renewalBodyKey,
  renewalLoud,
  renewalTitleKey,
} from '../domain/renewal';
import {
  cardSeenToday,
  getRenewal,
  loadCardDay,
  loadStripDay,
  markCardSeen,
  markStripClosed,
  refreshRenewal,
  stripClosedToday,
  subscribeRenewal,
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
 *   • البطاقة -- مرّة واحدة في اليوم، أول ما تفتح الشاشة.
 *   • الشريط  -- في آخر يومين فقط، أو إذا تأخّر التجديد أو رُفض الإيصال.
 */

const DASHBOARD_URL = 'https://rakeenapp.com/dashboard';
/** نسخ المتاجر لا توجّه أحداً للدفع خارجها (src/platform/storeRules.ts). */
const CAN_STEER = !NO_PAYMENT_STEERING;

export function useRenewal(): Renewal | null {
  const [renewal, setRenewal] = useState<Renewal | null>(getRenewal());
  useEffect(() => {
    const off = subscribeRenewal(setRenewal);
    loadCardDay();
    refreshRenewal();
    // بلا مؤقّت: نفس لحظات فحص الإيقاف -- الرجوع للواجهة يكفي، واليوم
    // الجديد يبدأ عند أول فتح على كل حال.
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') refreshRenewal();
    });
    return () => {
      off();
      sub.remove();
    };
  }, []);
  return renewal;
}

function titleOf(renewal: Renewal, t: (s: string) => string): string {
  return fillDays(t(renewalTitleKey(renewal)), renewal.days);
}

/** النقطة على تبويب «المزيد». */
export function RenewalDot({ renewal }: { renewal: Renewal | null }) {
  const styles = useStyles();
  if (!renewal) return null;
  return <View style={styles.dot} pointerEvents="none" />;
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
  /**
   * يبدأ مغلقاً حتى تُقرأ «أُغلق اليوم» من التخزين.
   *
   * وتبديلُ التبويب في هذا التطبيق يفكّ الشاشة ويعيد تركيبها، فحالةٌ
   * محلّيةٌ وحدَها تعني شريطاً يرجع مع كل رجوعٍ إلى «الرئيسية» -- وهو
   * الإزعاجُ الذي قيل إنه لا يجوز.
   */
  const [closed, setClosed] = useState(true);
  useEffect(() => {
    let alive = true;
    loadStripDay().then(() => {
      if (alive) setClosed(stripClosedToday(Date.now()));
    });
    return () => {
      alive = false;
    };
  }, [renewal]);

  const hidden = !renewal || !renewalLoud(renewal) || closed;
  useEffect(() => {
    if (hidden) onHeight?.(0);
  }, [hidden, onHeight]);
  if (hidden) return null;
  return (
    <View style={styles.strip} onLayout={e => onHeight?.(e.nativeEvent.layout.height)}>
      <View style={styles.stripDot} />
      <Text style={styles.stripTitle} numberOfLines={1}>
        {titleOf(renewal, t)}
      </Text>
      <Text style={styles.stripBody} numberOfLines={1}>
        {t(renewalBodyKey(renewal, CAN_STEER))}
      </Text>
      {CAN_STEER ? (
        <TouchableOpacity style={styles.stripGo} onPress={() => Linking.openURL(DASHBOARD_URL)}>
          <Text style={styles.stripGoText}>{t('افتح اللوحة')}</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={styles.stripClose}
        onPress={() => {
          setClosed(true);
          markStripClosed(Date.now());
        }}>
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
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!renewal) {
      setOpen(false);
      return;
    }
    let alive = true;
    // تُنتظر قراءةُ «عُرضت اليوم» قبل القرار: القراءةُ من التخزين غيرُ
    // فوريّة، ولو سبقتها حالةُ التجديد لظهرت البطاقةُ مرّةً ثانيةً في
    // يومٍ عُرضت فيه -- وهذا بالضبط ما يحوّل التذكير إلى إزعاج.
    loadCardDay().then(() => {
      if (!alive || cardSeenToday(Date.now())) return;
      setOpen(true);
      markCardSeen(Date.now());
    });
    return () => {
      alive = false;
    };
  }, [renewal]);

  const close = useCallback(() => setOpen(false), []);
  if (!renewal || !open) return null;

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

const INK = '#111410';
const PAPER = '#FBFAF5';
const LIME = '#C4FF2B';
const AMBER = '#FFC24B';

const useStyles = createStyles(() => ({
  dot: {
    position: 'absolute' as const,
    top: 4,
    start: 10,
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
  stripDot: { width: 8, height: 8, borderRadius: 99, backgroundColor: AMBER },
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
}));
