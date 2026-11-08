import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { TouchableOpacity } from './tappable';
import { createStyles, fonts, radii, useTheme } from './theme';
import { pagerConfig, pagerUrgency } from '../application/pagerService';
import type { PagerAction, PagerOrder } from '../application/pagerService';

/**
 * بطاقة «بيجر ركين» في «جارية» -- نفس بطاقة الويب (renderPagerCard):
 *
 *   قبل الجاهزية   الرقم كبير، والوقت الباقي على الوعد، و«جاهز» و«+٥ د».
 *   بعد الجاهزية   كم له ينتظر، و«رنّ ثاني» و«استلمه».
 *
 * الرقم أكبر ما في البطاقة: الكاشير ينادي به من بعيد لو الزبون ما فتح
 * البيجر -- ولهذا «📱 متابع / ما فتحه» ظاهرٌ فوقه.
 */

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}
export function mmss(totalSeconds: number): string {
  const abs = Math.abs(totalSeconds);
  return `${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

export default function PagerOrderCard({
  order,
  busy,
  onAction,
  now = Date.now(),
}: {
  order: PagerOrder;
  busy: boolean;
  onAction: (action: PagerAction) => void;
  now?: number;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const kind = order.channel === 'dine_in' ? 'محلي' : 'سفري';
  const who = order.customerName || kind;
  const ready = !!order.readyAt;
  const { urgency, secondsLeft } = pagerUrgency(order, now);
  const waiting = ready ? Math.max(0, Math.round((now - order.readyAt!.getTime()) / 1000)) : 0;

  return (
    <View
      style={[styles.card, ready ? styles.cardReady : urgency === 'urgent' ? styles.cardUrgent : urgency === 'warn' ? styles.cardWarn : null]}
      accessibilityLabel={`بيجر طلب ${order.id}`}>
      <View style={styles.top}>
        <View style={styles.chip}>
          <Text style={styles.chipText}>📟 بيجر · {kind}</Text>
        </View>
        <Text style={[styles.seen, !order.seenAt && styles.seenOff]}>{order.seenAt ? '📱 متابع' : 'ما فتحه'}</Text>
      </View>

      <Text style={styles.num}>#{order.id}</Text>
      <Text style={styles.who} numberOfLines={1}>
        {who}
        {order.delayedAt && !ready ? ' · أُجّل' : ''}
      </Text>

      <View style={[styles.time, ready ? styles.timeReady : urgency === 'urgent' ? styles.timeUrgent : urgency === 'warn' ? styles.timeWarn : null]}>
        <Text style={[styles.timeText, (ready || urgency !== 'ok') && styles.timeTextStrong]}>
          {ready
            ? `جاهز · ينتظر ${mmss(waiting)}${order.ringCount ? ` · رنّة ${order.ringCount + 1}` : ''}`
            : secondsLeft >= 0
              ? `باقي ${mmss(secondsLeft)}`
              : `متأخر ${mmss(-secondsLeft)}`}
        </Text>
      </View>

      {busy ? (
        <View style={[styles.btn, styles.btnBusy]}>
          <ActivityIndicator color={colors.muted} />
        </View>
      ) : ready ? (
        <View key="ready" style={styles.row}>
          <TouchableOpacity style={styles.half} onPress={() => onAction('ring')} activeOpacity={0.8} accessibilityRole="button">
            <View style={[styles.btn, styles.btnGhost]}>
              <Text style={styles.ghostText}>🔔 رنّ ثاني</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.half} onPress={() => onAction('collected')} activeOpacity={0.85} accessibilityRole="button">
            <View style={[styles.btn, styles.btnPrimary]}>
              <Text style={styles.btnText}>استلمه ✓</Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : (
        <View key="prep" style={styles.row}>
          <TouchableOpacity style={pagerConfig().settings.show_eta ? styles.wide : styles.half} onPress={() => onAction('ready')} activeOpacity={0.85} accessibilityRole="button">
            <View style={[styles.btn, styles.btnPrimary]}>
              <Text style={styles.btnText}>جاهز — رنّ جواله</Text>
            </View>
          </TouchableOpacity>
          {pagerConfig().settings.show_eta && <TouchableOpacity
            style={styles.narrow}
            onPress={() => onAction('delay')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="أضف خمس دقائق وبلّغ الزبون">
            <View style={[styles.btn, styles.btnGhost]}>
              <Text style={styles.ghostText}>+٥ د</Text>
            </View>
          </TouchableOpacity>}
        </View>
      )}
    </View>
  );
}

const useStyles = createStyles((colors) =>
  StyleSheet.create({
  card: {
    backgroundColor: colors.cardBg,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radii.lg,
    padding: 14,
    gap: 6,
    alignItems: 'center',
  },
  cardWarn: { borderColor: 'rgba(224,184,74,0.9)' },
  cardUrgent: { borderColor: colors.danger },
  cardReady: { borderColor: colors.lime, backgroundColor: 'rgba(196,255,43,0.10)' },
  top: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chip: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: radii.full, backgroundColor: 'rgba(196,255,43,0.16)' },
  chipText: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.text },
  seen: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.text },
  seenOff: { color: colors.muted, fontFamily: fonts.sansSemiBold },
  num: { fontFamily: fonts.monoBold, fontSize: 30, color: colors.text, writingDirection: 'ltr', marginTop: 2 },
  who: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.muted, maxWidth: '100%' },
  time: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: radii.full, backgroundColor: colors.surf1 },
  timeWarn: { backgroundColor: 'rgba(224,184,74,0.20)' },
  timeUrgent: { backgroundColor: 'rgba(224,138,106,0.22)' },
  timeReady: { backgroundColor: 'rgba(196,255,43,0.22)' },
  timeText: { fontFamily: fonts.monoBold, fontSize: 12.5, color: colors.muted },
  timeTextStrong: { color: colors.text },
  row: { alignSelf: 'stretch', flexDirection: 'row', gap: 8, marginTop: 4 },
  wide: { flex: 2.4 },
  narrow: { flex: 1 },
  half: { flex: 1 },
  btn: {
    minHeight: 46,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // لونٌ صلب، بلا GradientFill: هذه الأزرار تنركّب وسط تحديث (بعد «جاهز»)،
  // و react-native-linear-gradient مكوّنٌ قديم يمرّ بطبقة التوافق في Fabric
  // -- وعلى السنمي «استلمه» طلع مخفياً كلّه (لا تدرّج ولا نص). لونٌ ثابت لا
  // يعتمد على تلك الطبقة أبداً.
  btnPrimary: { backgroundColor: colors.lime },
  btnBusy: { alignSelf: 'stretch', backgroundColor: colors.surf1 },
  btnGhost: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf1 },
  btnText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.flagGreenDeep },
  ghostText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text },
}),
);
