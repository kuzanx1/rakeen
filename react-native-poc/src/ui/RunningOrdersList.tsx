import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from './tappable';
import GradientFill from './GradientFill';
import Money from './Money';
import {
  listActiveOrders,
  sortActiveOrders,
  remainingPrepSeconds,
  markDeliveryReady,
  markOutForDelivery,
  markDeliveryDelivered,
  markPickupReady,
  markPickupCollected,
} from '../application/activeOrderService';
import type { ActiveOrder } from '../application/activeOrderService';
import { createStyles, fonts, gradients, radii, useTheme } from './theme';

/**
 * "جارية" — orders that are paid for but not yet in the customer's hands.
 *
 * The tab the app was missing entirely. Accepting an online order set it
 * straight to `completed`, so it appeared under مكتملة and there was no
 * way left to record that it had been prepared, handed to a driver, or
 * collected — even though the columns for all three existed.
 *
 * Each channel has its own ladder, and they are genuinely different:
 *
 *   delivery   جاهز  →  خرج مع المندوب  →  تم التسليم
 *   pickup     جاهز  →  استلمه العميل
 *
 * A delivery order also races a prep deadline set by its platform, so it
 * carries a live countdown; a pickup order has no such deadline, because
 * a prep timeout is a delivery-platform concept and inventing one for
 * pickup would put a clock on something nobody is timing.
 */

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

/** formatMmSs (rakeen-pos.js:4972) — keeps the sign, because a late order
 *  reading "-03:12" is the whole point of the display. */
function formatMmSs(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? '-' : '';
  const abs = Math.abs(totalSeconds);
  return `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

export default function RunningOrdersList({ branchId }: { branchId: number }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [orders, setOrders] = useState<ActiveOrder[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  // Re-renders the countdowns once a second without refetching anything.
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      setOrders(sortActiveOrders(await listActiveOrders(branchId)));
      setError('');
    } catch {
      setOrders([]);
      setError('تعذر تحميل الطلبات الجارية — تحقق من الاتصال.');
    }
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const advance = async (order: ActiveOrder, step: 'ready' | 'out' | 'done') => {
    setBusyId(order.id);
    setError('');
    const run =
      order.channel === 'delivery'
        ? step === 'ready'
          ? markDeliveryReady
          : step === 'out'
            ? markOutForDelivery
            : markDeliveryDelivered
        : step === 'ready'
          ? markPickupReady
          : markPickupCollected;
    const result = await run(order.id);
    setBusyId(null);
    if (!result.ok) {
      setError(result.error ?? 'تعذر تحديث الطلب');
      return;
    }
    // Reload rather than patching locally: these RPCs can move an order
    // off the list entirely (delivered), and a platform order skips the
    // out-for-delivery stage, so the server's answer is the truth.
    await load();
  };

  if (orders == null) {
    return <ActivityIndicator color={colors.accentText} style={styles.loading} />;
  }

  if (orders.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.emptyBox}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.muted}
          />
        }>
        <Text style={styles.empty}>ما فيه طلبات جارية حاليًا</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={colors.muted}
        />
      }>
      {!!error && <Text style={styles.error}>{error}</Text>}

      {orders.map(order => {
        const isDelivery = order.channel === 'delivery';
        const remaining = isDelivery && !order.readyAt ? remainingPrepSeconds(order) : null;
        // Within five minutes of the deadline is the same threshold that
        // drives the source's own warning alert; past it is late.
        const late = remaining != null && remaining < 0;
        const soon = remaining != null && remaining >= 0 && remaining <= 300;

        return (
          <View key={order.id} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.cardHeadInfo}>
                <Text style={styles.cardTitle}>
                  #{order.id} · {isDelivery ? order.platformName : 'استلام'}
                </Text>
                {!!order.customerName && <Text style={styles.cardMeta}>{order.customerName}</Text>}
              </View>
              <Money value={order.total} size={14.5} />
            </View>

            {remaining != null && (
              <View style={[styles.timer, late && styles.timerLate, soon && styles.timerSoon]}>
                <Text style={[styles.timerText, (late || soon) && styles.timerTextAlert]}>
                  {late ? 'تأخر ' : 'باقي '}
                  {formatMmSs(remaining)}
                </Text>
              </View>
            )}

            <View style={styles.stage}>
              <Text style={styles.stageText}>
                {!order.readyAt
                  ? 'قيد التجهيز'
                  : order.outForDeliveryAt
                    ? 'مع المندوب'
                    : isDelivery
                      ? 'جاهز — بانتظار المندوب'
                      : 'جاهز — بانتظار العميل'}
              </Text>
            </View>

            {busyId === order.id ? (
              <View style={[styles.action, styles.actionBusy]}>
                <ActivityIndicator color={colors.muted} />
              </View>
            ) : !order.readyAt ? (
              <TouchableOpacity onPress={() => advance(order, 'ready')} activeOpacity={0.85}>
                <View style={styles.action}>
                  <GradientFill gradient={gradients.payButton} radius={radii.md} />
                  <Text style={styles.actionText}>جاهز</Text>
                </View>
              </TouchableOpacity>
            ) : isDelivery && !order.outForDeliveryAt ? (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.actionHalf}
                  onPress={() => advance(order, 'out')}
                  activeOpacity={0.85}>
                  <View style={styles.action}>
                    <GradientFill gradient={gradients.payButton} radius={radii.md} />
                    <Text style={styles.actionText}>خرج مع المندوب</Text>
                  </View>
                </TouchableOpacity>
                {/* A platform order skips the driver stage -- the platform's
                    own rider takes it -- so straight-to-delivered stays
                    available rather than forcing a stage that never
                    happened. */}
                <TouchableOpacity
                  style={[styles.actionHalf, styles.secondary]}
                  onPress={() => advance(order, 'done')}
                  activeOpacity={0.8}>
                  <Text style={styles.secondaryText}>تم التسليم</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => advance(order, 'done')} activeOpacity={0.85}>
                <View style={styles.action}>
                  <GradientFill gradient={gradients.payButton} radius={radii.md} />
                  <Text style={styles.actionText}>
                    {isDelivery ? 'تم التسليم' : 'استلمه العميل'}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const useStyles = createStyles((colors, shadows) =>
  StyleSheet.create({
    loading: { marginTop: 40 },
    list: { padding: 16, gap: 10 },
    emptyBox: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
    empty: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.muted, textAlign: 'center' },
    error: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.danger, textAlign: 'center', marginBottom: 8 },

    card: {
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radii.lg,
      padding: 14,
      gap: 10,
      ...shadows.sm,
    },
    cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
    cardHeadInfo: { flex: 1, minWidth: 0 },
    cardTitle: { fontFamily: fonts.sansBold, fontSize: 13.5, color: colors.text },
    cardMeta: { fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.muted, marginTop: 2 },

    timer: {
      alignSelf: 'flex-start',
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: radii.full,
      backgroundColor: colors.surf1,
    },
    timerSoon: { backgroundColor: 'rgba(224,184,74,0.20)' },
    timerLate: { backgroundColor: 'rgba(224,138,106,0.20)' },
    timerText: { fontFamily: fonts.monoBold, fontSize: 12.5, color: colors.muted },
    timerTextAlert: { color: colors.text },

    stage: { alignSelf: 'flex-start' },
    stageText: { fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.muted },

    action: {
      width: '100%',
      paddingVertical: 13,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    actionBusy: { backgroundColor: colors.surf2 },
    actionText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.flagGreenDeep },
    actionRow: { flexDirection: 'row', gap: 8 },
    actionHalf: { flex: 1 },
    secondary: {
      paddingVertical: 13,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surf1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text },
  }),
);
