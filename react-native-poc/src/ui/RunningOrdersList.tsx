import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Modal, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './Text';
import KeyboardLift from './KeyboardLift';
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
  confirmCodCollected,
  isScheduledHold,
  cancelOnlineOrder,
  CANCEL_REASONS,
  SCHEDULED_HOLD_MINUTES,
} from '../application/activeOrderService';
import type { ActiveOrder } from '../application/activeOrderService';
import { getOrderHistoryDetail } from '../application/orderHistoryService';
import {
  listPagerOrders,
  sortPagerOrders,
  pagerAction,
  pagerActionToast,
  pagerConfig,
  pagerUrgency,
  pagerDueAutoActions,
  markAutoDone,
  subscribePagerOrders,
  isOwnPagerOrder,
} from '../application/pagerService';
import type { PagerAction, PagerOrder } from '../application/pagerService';
import PagerOrderCard from './PagerOrderCard';
import { playAlertSound } from '../application/soundService';
import type { OrderHistoryDetail } from '../application/orderHistoryService';
import { formatArabicTime } from '../domain/arabicDate';
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

const PAYMENT_LABELS: Record<string, string> = { cash: 'كاش', card: 'شبكة', online: 'دفع إلكتروني' };

/** «٧:٣٠ م»، ومعه اسم اليوم لو مو اليوم. */
function timeLabel(at: Date): string {
  const today = at.toDateString() === new Date().toDateString();
  return (today ? '' : at.toLocaleDateString('ar-SA', { weekday: 'long' }) + ' ') + formatArabicTime(at);
}

function modLabel(m: unknown): string {
  return typeof m === 'string' ? m : (m as { text?: string })?.text ?? '';
}

/**
 * تفاصيل الطلب كاملة تحت سهم: الأصناف وإضافاتها وملاحظاتها، وملاحظة
 * الزبون، والعنوان، والدفع. تُجلب أول ما تنفتح بس، لا مع كل تحديث للقائمة.
 */
function OrderDetails({ orderId }: { orderId: number }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [detail, setDetail] = useState<OrderHistoryDetail | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    getOrderHistoryDetail(orderId)
      .then(d => alive && setDetail(d))
      .catch(() => alive && setDetail(null));
    return () => {
      alive = false;
    };
  }, [orderId]);
  if (detail === undefined) return <ActivityIndicator color={colors.muted} style={styles.detailsLoading} />;
  if (detail === null) return <Text style={styles.detailsMuted}>تعذر تحميل التفاصيل — تحقق من الاتصال.</Text>;
  return (
    <View style={styles.details}>
      {detail.items.map((it, i) => (
        <View key={i} style={styles.detailItem}>
          <View style={styles.detailItemRow}>
            <Text style={styles.detailQty}>{it.qty}×</Text>
            <Text style={styles.detailName}>{it.name}</Text>
            <Money value={it.lineTotal} size={12.5} />
          </View>
          {it.mods.map((m, j) => (
            <Text key={j} style={styles.detailMod}>— {modLabel(m)}</Text>
          ))}
          {!!it.note && <Text style={styles.detailNote}>ملاحظة: {it.note}</Text>}
        </View>
      ))}
      {!!detail.onlineNote && (
        <View style={styles.detailNoteBox}>
          <Text style={styles.detailNoteBoxText}>ملاحظة العميل: {detail.onlineNote}</Text>
        </View>
      )}
      {!!detail.deliveryAddress && <Text style={styles.detailLine}>العنوان: {detail.deliveryAddress}</Text>}
      <Text style={styles.detailLine}>وقت الطلب: {timeLabel(new Date(detail.createdAt))}</Text>
      <Text style={styles.detailLine}>الدفع: {PAYMENT_LABELS[detail.paymentMethod] ?? detail.paymentMethod}</Text>
      {detail.deliveryFee > 0 && (
        <View style={styles.detailItemRow}>
          <Text style={[styles.detailLine, styles.detailName]}>رسوم التوصيل</Text>
          <Money value={detail.deliveryFee} size={12.5} />
        </View>
      )}
    </View>
  );
}

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

export default function RunningOrdersList({
  branchId,
  shiftId,
  bottomInset = 0,
}: {
  branchId: number;
  /** ما تغطيه أشرطة الشاشة تحت القائمة -- آخر كرت وتفاصيله لازم تنسحب فوقها. */
  bottomInset?: number;
  /** The open shift a collected cash payment belongs to. Null when no
   *  shift is open, which is why the collect button refuses rather than
   *  banking the money nowhere. */
  shiftId: number | null;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [orders, setOrders] = useState<ActiveOrder[] | null>(null);
  // بيجر ركين: قائمة مستقلّة فوق الجارية (استعلامها يسقط وحده لو القاعدة قديمة).
  const [pagerOrders, setPagerOrders] = useState<PagerOrder[]>([]);
  const [pagerBusy, setPagerBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const lateWarned = useRef(new Set<number>());
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [cancelFor, setCancelFor] = useState<ActiveOrder | null>(null);
  // Re-renders the countdowns once a second without refetching anything.
  const [, setTick] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  // فتح التفاصيل ينزل القائمة لبداية الكرت، فتطلع التفاصيل قدّام العين لا تحت الشاشة.
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const cardY = useRef(new Map<number, number>());
  const toggleDetails = (id: number) => {
    const next = openId === id ? null : id;
    setOpenId(next);
    if (next != null) {
      const y = cardY.current.get(next);
      if (y != null) setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true }), 50);
    }
  };

  const loadPager = useCallback(async () => {
    try {
      setPagerOrders(sortPagerOrders(await listPagerOrders(branchId)));
    } catch {
      // الشبكة: تبقى كما هي.
    }
  }, [branchId]);

  const load = useCallback(async () => {
    loadPager();
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

  /* البيجر: طلباتٌ من أجهزةٍ أخرى، و«جاهز» من المطبخ، وفتح الزبون للبيجر
     -- تصل بالبثّ اللحظي، لا بسؤالٍ كل ثوانٍ. ويُجلب مرّة لما يرجع
     التطبيق للواجهة (ما فات وهو بالخلفية). */
  const pagerOn = pagerConfig().enabled;
  useEffect(() => {
    if (!pagerOn) return;
    const stop = subscribePagerOrders(branchId, loadPager);
    const app = AppState.addEventListener('change', st => { if (st === 'active') loadPager(); });
    return () => { stop(); app.remove(); };
  }, [pagerOn, branchId, loadPager]);

  const runPager = useCallback(async (o: PagerOrder, action: PagerAction, auto = false) => {
    if (!auto) setPagerBusy(o.id);
    const r = await pagerAction(o.id, action, 5);
    if (!auto) setPagerBusy(null);
    if (!auto || r.ok) setNotice(auto ? (action === 'ring' ? `🔔 رنّة تذكير تلقائية — طلب #${o.id}` : `أُقفل بيجر طلب #${o.id} تلقائياً`) : pagerActionToast(o.id, action, r));
    if (!r.ok && !auto) setError(r.error || 'تعذر التحديث');
    await loadPager();
  }, [loadPager]);

  /* كل ٥ ثوانٍ، لطلبات هذا الجهاز وحده: رنّة التذكير، والإقفال التلقائي،
     وتنبيه التأخّر مرّة. (نفس مؤقّت الويب.) */
  useEffect(() => {
    if (!pagerOrders.length) return;
    const id = setInterval(() => {
      const now = Date.now();
      for (const a of pagerDueAutoActions(pagerOrders, now)) {
        markAutoDone(a.id, a.action);
        const o = pagerOrders.find(x => x.id === a.id);
        if (o) runPager(o, a.action, true);
      }
      if (pagerConfig().settings.late_alert) {
        for (const o of pagerOrders) {
          if (o.readyAt || lateWarned.current.has(o.id)) continue;
          if (pagerUrgency(o, now).urgency === 'urgent') {
            lateWarned.current.add(o.id);
            playAlertSound('warning');
            setNotice(`⏰ طلب #${o.id} تجاوز الوقت اللي وعدنا فيه الزبون — جهّزه أو اضغط «+٥ د»`);
          }
        }
      }
    }, 5000);
    return () => clearInterval(id);
  }, [pagerOrders, runPager]);

  /**
   * ولا تدور النبضةُ إلا حين يوجد ما يُعدّ.
   *
   * كانت تدور كلَّ ثانيةٍ أبداً ما دامت الشاشة مفتوحة، فتُعيد رسمَ
   * القائمة كلِّها ستّين مرّةً في الدقيقة -- ولا عدّاد فيها أصلاً.
   * والعدّادُ لطلبات التوصيل التي لم تجهز وحدها، ومقهىً بلا توصيلٍ لا
   * عدّادَ فيه قطّ.
   */
  // نفسُ شرط العرض تحت: channel==='delivery' وبلا readyAt.
  const hasCountdown = (orders ?? []).some(o => o.channel === 'delivery' && !o.readyAt) || pagerOrders.length > 0;
  useEffect(() => {
    if (!hasCountdown) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasCountdown]);
  // طلب مجدول معلّق يطلع للتجهيز لحاله لما يقرب وقته: فحصٌ كل نص دقيقة يكفي.
  const hasScheduled = (orders ?? []).some(o => o.scheduledFor != null && !o.readyAt);
  useEffect(() => {
    if (!hasScheduled) return;
    const id = setInterval(() => setOrders(o => (o ? sortActiveOrders(o) : o)), 30_000);
    return () => clearInterval(id);
  }, [hasScheduled]);

  const advance = async (order: ActiveOrder, step: 'ready' | 'out' | 'done') => {
    setBusyId(order.id);
    setError('');

    // For a cash order the final step IS the payment, so it takes the
    // collection path instead of the plain handover one. Refused outright
    // with no open shift: the money would otherwise be marked received
    // and belong to no shift's drawer, which is the failure this whole
    // flow exists to prevent.
    if (step === 'done' && order.isCod) {
      if (shiftId == null) {
        setBusyId(null);
        setError('افتح وردية أولًا عشان يتسجل المبلغ فيها.');
        return;
      }
      const collected = await confirmCodCollected(order.id, shiftId);
      setBusyId(null);
      if (!collected.ok) {
        setError(collected.error ?? 'تعذر تسجيل استلام المبلغ');
        return;
      }
      await load();
      return;
    }

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

  const pagerIds = new Set(pagerOrders.map(o => o.id));
  const pagerSection = pagerOrders.length > 0 ? (
    <View style={styles.pagerSection}>
      <Text style={styles.sectionTitle}>📟 بيجر ركين — الزبون ينتظر جواله يرن</Text>
      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      <View style={styles.pagerGrid}>
        {pagerOrders.map(o => (
          <View key={o.id} style={styles.pagerCell}>
            <PagerOrderCard order={o} busy={pagerBusy === o.id} onAction={a => runPager(o, a)} />
          </View>
        ))}
      </View>
    </View>
  ) : null;
  const restOrders = orders.filter(o => !pagerIds.has(o.id));

  if (restOrders.length === 0 && pagerOrders.length > 0) {
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.list, { paddingBottom: 16 + bottomInset + 60 }]}
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
        {pagerSection}
      </ScrollView>
    );
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
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={[styles.list, { paddingBottom: 16 + bottomInset + 60 }]}
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
      {pagerSection}

      {restOrders.map((order, idx) => {
        const isDelivery = order.channel === 'delivery';
        const held = isScheduledHold(order);
        const firstHeld = held && (idx === 0 || !isScheduledHold(restOrders[idx - 1]));
        const open = openId === order.id;
        const remaining = isDelivery && !order.readyAt ? remainingPrepSeconds(order) : null;
        // Within five minutes of the deadline is the same threshold that
        // drives the source's own warning alert; past it is late.
        const late = remaining != null && remaining < 0;
        const soon = remaining != null && remaining >= 0 && remaining <= 300;

        return (
          <React.Fragment key={order.id}>
          {firstHeld && <Text style={styles.sectionTitle}>مجدولة — تطلع للتجهيز قبل وقتها بنص ساعة</Text>}
          <View
            style={[styles.card, held && styles.cardHeld]}
            onLayout={e => cardY.current.set(order.id, e.nativeEvent.layout.y)}>
            <View style={styles.cardHead}>
              <View style={styles.cardHeadInfo}>
                <Text style={styles.cardTitle}>
                  #{order.id} · {isDelivery ? order.platformName : order.isOnline ? 'طلب إلكتروني — استلام' : 'سفري'}
                </Text>
                {!!order.customerName && <Text style={styles.cardName}>{order.customerName}</Text>}
              </View>
              <Money value={order.total} size={14.5} />
            </View>

            {!!order.customerPhone && (
              <TouchableOpacity
                onPress={() => Linking.openURL('tel:' + order.customerPhone)}
                activeOpacity={0.8}
                style={styles.phonePill}>
                <Text style={styles.phoneLabel}>جوال العميل</Text>
                <Text style={styles.phoneNum}>{order.customerPhone}</Text>
              </TouchableOpacity>
            )}

            {/* الوقت اللي حدده الزبون أهم سطر في الكرت: المطبخ يجهّز عليه. */}
            {order.scheduledFor != null && !order.readyAt && (
              <View style={[styles.schedBox, held && styles.schedBoxHeld]}>
                <Text style={styles.schedLabel}>مطلوب تجهيزه الساعة</Text>
                <Text style={styles.schedTime}>{timeLabel(order.scheduledFor)}</Text>
                {held && (
                  <Text style={styles.schedHint}>
                    معلّق — يطلع للتجهيز {timeLabel(new Date(order.scheduledFor.getTime() - SCHEDULED_HOLD_MINUTES * 60_000))}
                  </Text>
                )}
              </View>
            )}

            {/* The buzzer number, given the most weight on the card: this
                is the one thing someone has to read off it and type into
                the base station to call the customer over. */}
            {order.pagerNumber != null && (
              <View style={styles.pagerPill}>
                <Text style={styles.pagerPillLabel}>جهاز النداء</Text>
                <Text style={styles.pagerPillNum}>{order.pagerNumber}</Text>
              </View>
            )}

            {order.isCod && (
              <View style={styles.codPill}>
                <Text style={styles.codText}>
                  الدفع عند الاستلام — المبلغ ما تحصّل بعد
                </Text>
              </View>
            )}

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
                {held
                  ? 'مجدول — ما بدأ تجهيزه'
                  : !order.readyAt
                  ? 'قيد التجهيز'
                  : order.outForDeliveryAt
                    ? 'مع المندوب'
                    : isDelivery
                      ? 'جاهز — بانتظار المندوب'
                      : 'جاهز — بانتظار العميل'}
              </Text>
            </View>

            <TouchableOpacity onPress={() => toggleDetails(order.id)} activeOpacity={0.7} style={styles.toggle}>
              <Text style={styles.toggleText}>{open ? 'إخفاء التفاصيل ▴' : 'تفاصيل الطلب ▾'}</Text>
            </TouchableOpacity>
            {open && <OrderDetails orderId={order.id} />}

            {held ? null : busyId === order.id ? (
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
                  <Text style={styles.secondaryText}>
                    {order.isCod ? 'سُلّم واستلمت المبلغ' : 'تم التسليم'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => advance(order, 'done')} activeOpacity={0.85}>
                <View style={styles.action}>
                  <GradientFill gradient={gradients.payButton} radius={radii.md} />
                  <Text style={styles.actionText}>
                    {order.isCod
                      ? isDelivery
                        ? 'تم التسليم واستلمت المبلغ'
                        : 'استلمه العميل ودفع'
                      : isDelivery
                        ? 'تم التسليم'
                        : 'استلمه العميل'}
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {/* إلغاء طلب إلكتروني انقبل: بس قبل ما ينحسب مبلغه، وبعد تأكيد مع العميل */}
            {order.isOnline && order.isCash && busyId !== order.id && (
              <TouchableOpacity onPress={() => setCancelFor(order)} activeOpacity={0.75} style={styles.cancelLink}>
                <Text style={styles.cancelLinkText}>إلغاء الطلب</Text>
              </TouchableOpacity>
            )}
          </View>
          </React.Fragment>
        );
      })}
      <CancelOrderModal
        order={cancelFor}
        onClose={() => setCancelFor(null)}
        onDone={async msg => {
          setCancelFor(null);
          setError(msg);
          await load();
        }}
      />
    </ScrollView>
  );
}

/**
 * نافذة إلغاء طلب إلكتروني بعد قبوله. الإلغاء بعد ما قلنا للزبون «انقبل
 * طلبك» يمس الزبون مباشرة، فقبل الزر: تواصل معه وتأكد (زر اتصال جاهز)،
 * اختر السبب، وعلّم إنك تواصلت -- وبعدها يصير الإلغاء ممكن.
 */
export function CancelOrderModal({
  order,
  onClose,
  onDone,
}: {
  order: Pick<ActiveOrder, 'id' | 'customerName' | 'customerPhone'> | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { colors, shadows } = useTheme();
  const styles = useStyles();
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [contacted, setContacted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setReason(null);
    setOther('');
    setContacted(false);
    setBusy(false);
    setErr('');
  }, [order?.id]);

  const finalReason = reason === '__other__' ? other.trim() : reason;
  const ready = !!finalReason && contacted && !busy;

  const confirm = async () => {
    if (!order || !finalReason) return;
    setBusy(true);
    setErr('');
    const r = await cancelOnlineOrder(order.id, finalReason);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? 'تعذر إلغاء الطلب');
      return;
    }
    onDone(`انلغى الطلب #${order.id} — ${finalReason}`);
  };

  return (
    <Modal visible={order != null} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardLift style={styles.cOverlay}>
        <View style={[styles.cCard, shadows.md]}>
          <ScrollView contentContainerStyle={styles.cBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.cTitle}>إلغاء الطلب #{order?.id}</Text>

            <View style={styles.cWarn}>
              <Text style={styles.cWarnTitle}>تواصل مع العميل أول</Text>
              <Text style={styles.cWarnText}>
                الطلب انقبل والعميل يحسبه جاري. كلّمه وتأكد منه قبل ما تلغي.
              </Text>
              {!!order?.customerPhone && (
                <TouchableOpacity
                  style={styles.cCall}
                  onPress={() => Linking.openURL('tel:' + order.customerPhone)}
                  activeOpacity={0.8}>
                  <Text style={styles.cCallText}>
                    اتصل على {order.customerName ? order.customerName + ' — ' : ''}{order.customerPhone}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.cSub}>سبب الإلغاء</Text>
            <View style={styles.cChips}>
              {[...CANCEL_REASONS, '__other__'].map(r => {
                const active = reason === r;
                return (
                  <TouchableOpacity
                    key={r}
                    style={[styles.cChip, active && styles.cChipActive]}
                    onPress={() => setReason(r)}
                    activeOpacity={0.8}>
                    <Text style={[styles.cChipText, active && styles.cChipTextActive]}>
                      {r === '__other__' ? 'سبب ثاني' : r}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {reason === '__other__' && (
              <TextInput
                style={styles.cInput}
                placeholder="اكتب السبب..."
                placeholderTextColor={colors.muted}
                value={other}
                onChangeText={setOther}
                autoFocus
              />
            )}

            <TouchableOpacity style={styles.cCheckRow} onPress={() => setContacted(c => !c)} activeOpacity={0.8}>
              <View style={[styles.cBox, contacted && styles.cBoxOn]}>
                {contacted && <Text style={styles.cBoxTick}>✓</Text>}
              </View>
              <Text style={styles.cCheckText}>تواصلت مع العميل وأكّد الإلغاء</Text>
            </TouchableOpacity>

            {!!err && <Text style={styles.error}>{err}</Text>}

            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.actionHalf, styles.secondary]} onPress={onClose} disabled={busy} activeOpacity={0.8}>
                <Text style={styles.secondaryText}>رجوع</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionHalf, styles.cConfirm, !ready && styles.cConfirmOff]}
                onPress={confirm}
                disabled={!ready}
                activeOpacity={0.85}>
                {busy ? (
                  <ActivityIndicator color={colors.muted} />
                ) : (
                  <Text style={[styles.cConfirmText, !ready && styles.cConfirmTextOff]}>تأكيد الإلغاء</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardLift>
    </Modal>
  );
}

const useStyles = createStyles((colors, shadows) =>
  StyleSheet.create({
    loading: { marginTop: 40 },
    scroll: { flex: 1 },

    cancelLink: { alignSelf: 'stretch', marginTop: 8, paddingVertical: 10, borderRadius: radii.md, borderWidth: 1.2, borderColor: colors.danger, alignItems: 'center' },
    cancelLinkText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.danger },
    cOverlay: { flex: 1, backgroundColor: 'rgba(6,16,10,0.72)', alignItems: 'center', justifyContent: 'center', padding: 16 },
    cCard: { width: 420, maxWidth: '94%', maxHeight: '90%', backgroundColor: colors.cardBg, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
    cBody: { padding: 20, gap: 12 },
    cTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text, textAlign: 'center' },
    cWarn: { padding: 12, borderRadius: radii.md, backgroundColor: 'rgba(224,138,106,0.14)', gap: 6 },
    cWarnTitle: { fontFamily: fonts.sansBold, fontSize: 13.5, color: colors.danger },
    cWarnText: { fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.text, lineHeight: 19 },
    cCall: { marginTop: 2, paddingVertical: 10, borderRadius: radii.md, backgroundColor: colors.cardBg, alignItems: 'center', borderWidth: 1, borderColor: colors.line },
    cCallText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.accentText },
    cSub: { fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.muted },
    cChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    cChip: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf1 },
    cChipActive: { backgroundColor: colors.danger, borderColor: colors.danger },
    cChipText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text },
    cChipTextActive: { color: '#ffffff' },
    cInput: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf1, color: colors.text, fontFamily: fonts.sansSemiBold, fontSize: 13, textAlign: 'right' },
    cCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
    cBox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
    cBoxOn: { backgroundColor: colors.danger, borderColor: colors.danger },
    cBoxTick: { color: '#ffffff', fontFamily: fonts.sansBold, fontSize: 14 },
    cCheckText: { flex: 1, fontFamily: fonts.sansBold, fontSize: 13, color: colors.text },
    cConfirm: { paddingVertical: 13, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger },
    cConfirmOff: { backgroundColor: colors.surf2 },
    cConfirmText: { fontFamily: fonts.sansBold, fontSize: 13, color: '#ffffff' },
    cConfirmTextOff: { color: colors.muted },
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
    cardName: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text, marginTop: 3 },
    cardHeld: { opacity: 0.8, borderStyle: 'dashed' },
    sectionTitle: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.muted, marginTop: 8 },
    pagerSection: { gap: 8 },
    pagerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    pagerCell: { flexGrow: 1, flexBasis: 230, maxWidth: '100%' },
    notice: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.text, textAlign: 'center' },

    phonePill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: radii.full,
      backgroundColor: colors.surf2,
    },
    phoneLabel: { fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.muted },
    phoneNum: { fontFamily: fonts.monoBold, fontSize: 16, color: colors.text, letterSpacing: 0.5 },

    schedBox: {
      borderWidth: 1.5,
      borderColor: colors.accentText,
      borderRadius: radii.md,
      paddingVertical: 10,
      paddingHorizontal: 12,
      alignItems: 'center',
      gap: 2,
    },
    schedBoxHeld: { borderStyle: 'dashed', borderColor: colors.line },
    schedLabel: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.muted },
    schedTime: { fontFamily: fonts.sansBold, fontSize: 24, color: colors.text },
    schedHint: { fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.muted },

    toggle: { alignSelf: 'flex-start', paddingVertical: 2 },
    toggleText: { fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.accentText },
    details: { gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 },
    detailsLoading: { marginVertical: 8 },
    detailsMuted: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.muted },
    detailItem: { gap: 2 },
    detailItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    detailQty: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.text },
    detailName: { flex: 1, fontFamily: fonts.sansBold, fontSize: 13, color: colors.text },
    detailMod: { fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.muted, paddingStart: 22 },
    detailNote: { fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.text, paddingStart: 22 },
    detailNoteBox: { backgroundColor: colors.surf1, borderRadius: radii.md, padding: 8 },
    detailNoteBoxText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text },
    detailLine: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.muted },

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

    pagerPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 5,
      paddingHorizontal: 12,
      borderRadius: radii.full,
      backgroundColor: colors.surf2,
    },
    pagerPillLabel: { fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.muted },
    pagerPillNum: { fontFamily: fonts.monoBold, fontSize: 17, color: colors.text },

    codPill: {
      alignSelf: 'flex-start',
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: radii.full,
      backgroundColor: 'rgba(224,184,74,0.20)',
    },
    codText: { fontFamily: fonts.sansBold, fontSize: 11.5, color: colors.text },

    stage: { alignSelf: 'flex-start' },
    stageText: { fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.muted },

    action: {
      width: '100%',
      paddingVertical: 13,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: colors.lime, // تحت التدرّج: لو ما ترسم يبقى الزر ظاهر (GradientFill)
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
