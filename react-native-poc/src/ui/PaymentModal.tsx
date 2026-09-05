import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './Text';
import { TouchableOpacity } from './tappable';
import { Image } from 'react-native';
import GradientFill from './GradientFill';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import type { PaymentMethod } from '../domain/payment';
import { computeCashChange } from '../domain/payment';
import type { OrderChannel } from '../domain/cart';
import type { Customer } from '../domain/customer';
import { searchCustomers } from '../application/customerService';
import type { DeliveryPlatform } from '../application/catalogService';
import { isPagerNumberBusy } from '../application/catalogService';
import { setOrderPager } from '../application/activeOrderService';
import { normalisePhoneInput, validateNewCustomerDraft } from '../domain/customer';
import { listPrintJobs, retryPrintJob } from '../application/printService';
import { isPrintJobTerminal } from '../domain/printQueue';
import type { PrintJobStatus } from '../domain/printQueue';
import Money from './Money';
import { createStyles, fonts, gradients, radii, spacing, useTheme } from './theme';
import { toLatinDigits } from '../domain/digits';

/**
 * The payment popup is a WIZARD, not a single sheet -- something only
 * clicking through the live PWA made obvious. `modalStepStack`
 * (rakeen-pos.js:1459) pushes one render function per step and
 * `modalGoBack()` pops it, and the head's title is rewritten each time:
 *
 *   1. renderChannelStep()   "نوع الطلب"  .channel-row + التالي
 *   2. renderCustomerStep()  "العميل"     search / attached customer
 *   3. renderPaymentStep()   "الدفع"      .pm-tabs, tender, confirm
 *
 * This app had step 3 only, with the channel row misplaced in the cart
 * panel and the customer attached from a separate screen entirely.
 *
 * Two gates skip a step outright, exactly as the source does:
 *   - dine_in is filtered out of the channel list unless DINE_IN_ENABLED.
 *   - `if(!LOYALTY_ENABLED){ proceedFromCustomerStep(); return; }` -- the
 *     customer step is not rendered at all, not merely emptied.
 *
 * Tender defaults, from proceedFromCustomerStep() (:1288):
 *   delivery      -> method 'delivery_platform', no tabs at all
 *   everything else -> method 'cash' AND `state.cashAmount = total`
 * so the cash field arrives PRE-FILLED and تأكيد الدفع starts enabled.
 * Tapping any tab then resets both tendered amounts to 0 (:1697), which
 * empties the field and disables confirm again. An earlier pass here read
 * the `value="${state.cashAmount||''}"` template literally and started it
 * empty -- correct for the template, wrong for the state that reaches it.
 *
 * Shell: .modal-card is a CENTRED dialog -- `width:420px; max-width:92vw;
 * max-height:88vh`, 1px line border, --r-xl, --shadow-md over a
 * rgba(6,16,10,0.78) overlay -- not the bottom sheet this used to be.
 */

type Step = 'channel' | 'tablePicker' | 'customer' | 'newCustomer' | 'payment' | 'success';

/** What onConfirm reports back so the success step can show real numbers
 *  and a real print status instead of inventing either. */
export interface PaymentResult {
  ok: boolean;
  /** What the customer actually handed over. */
  paid: number;
  /** Cash only; zero for every other method. */
  change: number;
  /** The queued customer-receipt job, so its live status can be shown.
   *  Null when the printer profile has customer receipts switched off --
   *  the source hides the whole row in that case rather than showing a
   *  spinner that will never resolve. */
  printJobId: string | null;
  /** The order just created, so a buzzer number can be attached to it.
   *  Null when the sale queued offline and has no server id yet — a
   *  buzzer cannot be recorded against a row that does not exist. */
  orderId?: number | null;
}

/** state.customer. `id` is nullable because a customer typed at checkout
 *  has no row yet -- the source's own `state.customer.id` guards exist for
 *  exactly that case (it gates the الولاء tab and points redemption). */
export interface AttachedCustomer {
  id: number | null;
  name: string;
  phone: string | null;
  points: number;
}

const CHANNELS: { id: OrderChannel; label: string }[] = [
  { id: 'dine_in', label: '🍽️ محلي' },
  { id: 'pickup', label: '📦 سفري' },
  { id: 'delivery', label: '🛵 تطبيقات التوصيل' },
];

const STEP_TITLE: Record<Step, string> = {
  channel: 'نوع الطلب',
  tablePicker: 'اختر الطاولة',
  customer: 'العميل',
  newCustomer: 'عميل جديد',
  payment: 'الدفع',
  success: 'تمت العملية',
};

/** The visible countdown before the next order starts on its own
 *  (rakeen-pos.js:3352). Four seconds, ticked once a second. */
const AUTO_RESET_SECONDS = 4;

export default function PaymentModal({
  visible,
  total,
  onCancel,
  onConfirm,
  submitting,
  businessId,
  branchId,
  channel,
  onChannelChange,
  customer,
  onCustomerChange,
  dineInEnabled = true,
  loyaltyEnabled = true,
  dineInMode = 'simple',
  pagerEnabled = false,
  onLoyaltySelected,
  deliveryPlatforms,
  deliveryPlatformId,
  onDeliveryPlatformChange,
  invoiceLast4,
  onInvoiceLast4Change,
  availableTables,
  onClaimTable,
  hasTable,
}: {
  visible: boolean;
  total: number;
  onCancel: () => void;
  /** Closes the popup AND starts the next order -- the source's own
   *  startNewOrder() is just closePaymentModalNow(). */
  /** pagerNumber is the buzzer handed over with this sale, or null. It is
   *  passed in rather than looked up afterwards so the kitchen ticket —
   *  queued inside this call — can carry it. */
  onConfirm: (
    method: PaymentMethod,
    cashAmount: number | null,
    pagerNumber: number | null,
  ) => Promise<PaymentResult>;
  submitting: boolean;
  businessId: number;
  /** Buzzer numbers only collide within a branch: two branches can each
   *  have a 20 out at the same moment and neither is wrong. */
  branchId: number;
  channel: OrderChannel;
  onChannelChange: (c: OrderChannel) => void;
  customer: AttachedCustomer | null;
  onCustomerChange: (c: AttachedCustomer | null) => void;
  /** DINE_IN_ENABLED -- filters 🍽️ بالمطعم out of the channel row. */
  dineInEnabled?: boolean;
  /** LOYALTY_ENABLED -- when false the customer step is skipped whole. */
  loyaltyEnabled?: boolean;
  /**
   * 'simple' — the customer orders at the till and sits wherever; there is
   * no table to pick and none to close later. The kitchen still needs to
   * know it is dine-in, because it is plated rather than bagged.
   * 'tables' — full table service, the existing behaviour.
   */
  dineInMode?: 'simple' | 'tables';
  /** Hand out a numbered call-buzzer on till orders. */
  pagerEnabled?: boolean;
  /** Picking الولاء hands off to the redemption flow instead of tendering.
   *  renderPaymentStep() does exactly this: `renderLoyaltyWaitStep();
   *  return;` -- the loyalty method never reaches the tender UI at all. */
  onLoyaltySelected: () => void;
  /** The branch's delivery apps. A delivery order that names none cannot
   *  be split by platform in the dashboard's reports. */
  deliveryPlatforms: DeliveryPlatform[];
  deliveryPlatformId: number | null;
  onDeliveryPlatformChange: (id: number) => void;
  /** orders.platform_invoice_last4 -- required before a delivery order can
   *  be confirmed, since that is what reconciles it against the platform's
   *  own statement. */
  invoiceLast4: string;
  onInvoiceLast4Change: (v: string) => void;
  /** Free tables for the picker, and the guarded claim. */
  availableTables: { id: number; number: string | number }[];
  onClaimTable: (tableId: number) => Promise<boolean>;
  hasTable: boolean;
}) {
  const { colors, shadows } = useTheme();
  const styles = useStyles();

  const [step, setStep] = useState<Step>('channel');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [cashInput, setCashInput] = useState('');
  const [splitCardInput, setSplitCardInput] = useState('');
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [friendsCount, setFriendsCount] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Customer[] | null>(null);
  const [searching, setSearching] = useState(false);

  /** Filled in by onConfirm; drives everything the success step shows. */
  const [result, setResult] = useState<PaymentResult | null>(null);
  /**
   * The order total, captured the instant the sale is confirmed.
   *
   * The success screen used to read the live `total` prop, but by the time
   * it renders the parent has already cleared the cart — so the headline
   * amount was 0.00 on every completed sale, sitting above a "المدفوع"
   * line that showed the real figure.
   */
  const [paidTotal, setPaidTotal] = useState(0);

  /**
   * The buzzer handed to this customer.
   *
   * Only asked for where the customer walks away and comes back: takeaway,
   * and simple dine-in. A table-service order already has a table number
   * doing this job, and a delivery order has no customer standing here.
   */
  const [pagerInput, setPagerInput] = useState('');
  const [pagerError, setPagerError] = useState('');
  const [printStatus, setPrintStatus] = useState<PrintJobStatus | null>(null);
  const [printRetries, setPrintRetries] = useState(0);
  const [countdown, setCountdown] = useState(AUTO_RESET_SECONDS);
  const [sentWhatsapp, setSentWhatsapp] = useState(false);

  /** renderNewCustomerStep()'s two fields. */
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  // Reserved for the loyalty card QR, which the source shows only when a
  // customer phone was captured on this order. Wired as a flag first
  // because it also decides whether the 4-second auto-reset runs at all.
  const showLoyaltyQr = false;


  // A cart can still be carrying `delivery` from before the last platform
  // was removed, or from a build where the channel was always offered.
  // Left alone it would show a channel row with nothing selected and then
  // book the sale as platform-prepaid anyway, so it is moved to the first
  // channel that is actually available.
  useEffect(() => {
    if (!visible || channel !== 'delivery' || deliveryPlatforms.length > 0) return;
    onChannelChange(dineInEnabled ? 'dine_in' : 'pickup');
  }, [visible, channel, deliveryPlatforms.length, dineInEnabled, onChannelChange]);

  useEffect(() => {
    if (!visible) return;
    // resetModalStack(renderChannelStep) -- every open starts at step 1,
    // EXCEPT when there is only one order type to pick. A shop with no
    // dine-in and no delivery apps has nothing to choose here, and a step
    // with a single button is a tap asking permission to do the only thing
    // possible. The channel is set to that one type and the step skipped.
    setStep('channel');
    setMethod('cash');
    setCashInput('');
    setSplitCardInput('');
    setFriendsOpen(false);
    setFriendsCount(null);
    setPagerInput('');
    setPagerError('');
    setQuery('');
    setSuggestions(null);
    setNewName('');
    setNewPhone('');
    setResult(null);
    setPrintStatus(null);
    setPrintRetries(0);
    setCountdown(AUTO_RESET_SECONDS);
    setSentWhatsapp(false);
  }, [visible]);

  /**
   * The print row is live, not a one-shot label. The source subscribes to
   * its job with onPrintJobUpdate() and re-renders the row on every change
   * (attemptPrint(), rakeen-pos.js:3182); there is no such subscription in
   * this app's queue, so poll the job list for the same effect. Stops as
   * soon as the job reaches a terminal state, so a settled receipt costs
   * nothing.
   */
  useEffect(() => {
    const jobId = result?.printJobId;
    if (step !== 'success' || !jobId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const job = (await listPrintJobs()).find(j => j.id === jobId);
        if (cancelled || !job) return;
        setPrintStatus(job.status);
        setPrintRetries(job.retry_count);
        if (isPrintJobTerminal(job.status)) clearInterval(id);
      } catch {
        // A queue read failing is not worth surfacing on a screen whose
        // job is to say the SALE succeeded -- the row just keeps showing
        // its last known state.
      }
    };
    const id = setInterval(tick, 700);
    tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [step, result?.printJobId]);

  /**
   * The 4-second auto-reset (rakeen-pos.js:3351). Deliberately NOT started
   * when a loyalty QR is on screen -- the source's own comment says four
   * seconds "isn't enough time for the customer to get their phone out and
   * scan it", so the cashier closes it by hand instead.
   */
  useEffect(() => {
    if (step !== 'success' || showLoyaltyQr) return;
    const id = setInterval(() => {
      setCountdown(n => {
        if (n <= 1) {
          clearInterval(id);
          onCancel();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [step, showLoyaltyQr, onCancel]);

  /** `input.addEventListener('input', ...)` with a 320ms timer and a
   *  2-character floor (rakeen-pos.js:1229-1234); under two characters it
   *  clears the list without searching at all. */
  useEffect(() => {
    if (step !== 'customer') return;
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        setSuggestions(await searchCustomers(businessId, q));
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 320);
    return () => clearTimeout(id);
  }, [query, step, businessId]);

  /** proceedFromCustomerStep() (:1288). */
  const proceedToPayment = () => {
    setFriendsOpen(false);
    setFriendsCount(null);
    if (channel === 'delivery') {
      setMethod('delivery_platform');
      setCashInput('');
    } else {
      setMethod('cash');
      setCashInput(total.toFixed(2));
    }
    setStep('payment');
  };

  const advanceToCustomer = () => {
    // `if(!LOYALTY_ENABLED){ proceedFromCustomerStep(); return; }`
    if (!loyaltyEnabled) proceedToPayment();
    else setStep('customer');
  };

  /**
   * Picking a channel advances straight away.
   *
   * There used to be a "التالي" button under the row, which meant the step
   * could be completed without choosing anything: `channel` carries a
   * default, so tapping Next with nothing selected silently filed the order
   * as dine-in and jumped to the table picker — a screen the cashier never
   * asked for. A single row of choices does not need a confirm step; the
   * tap is the confirmation.
   */
  /** Only full table service asks which table; simple dine-in has none. */
  const needsTable = (id: OrderChannel) =>
    id === 'dine_in' && dineInMode === 'tables' && !hasTable;

  const chooseChannel = (id: OrderChannel) => {
    onChannelChange(id);
    // Delivery is the one channel that asks a second question on this same
    // step: WHICH app the order came from. Advancing on the channel tap
    // would answer it silently with whichever platform happens to be
    // first, and that platform is what the sale is booked against. So
    // delivery stays put and the platform tap is what moves on.
    if (id === 'delivery') return;
    if (needsTable(id)) setStep('tablePicker');
    else advanceToCustomer();
  };

  const choosePlatform = (platformId: number) => {
    onDeliveryPlatformChange(platformId);
    advanceToCustomer();
  };

  const advanceFromChannel = () => {
    // Most dine-in orders already carry a table (started by tapping one on
    // the Tables screen). This step exists for the other case: the cart was
    // built from Home and "بالمطعم" is being chosen here for the first
    // time -- without it the order is filed with no table at all.
    if (needsTable(channel)) setStep('tablePicker');
    else advanceToCustomer();
  };

  const [claimError, setClaimError] = useState('');
  const claimAndContinue = async (tableId: number, label: string) => {
    setClaimError('');
    const claimed = await onClaimTable(tableId);
    if (!claimed) {
      // A guarded available -> awaiting_order transition: if another till
      // took the table a second earlier, the update matches no row and
      // this is how the cashier finds out, rather than two orders landing
      // on the same table.
      setClaimError(`طاولة ${label} انشغلت للتو`);
      return;
    }
    advanceToCustomer();
  };

  /** `state.activePaymentMethod = ...; state.cashAmount=0;
   *  state.splitCardAmount=0` on every tab tap (:1697). */
  const pickMethod = (m: PaymentMethod) => {
    if (m === 'loyalty') {
      // Never becomes the active tender method. The source jumps straight
      // to the customer-confirmation wait and returns, so there is no
      // "confirm" a cashier could press to settle an order on points
      // without the cardholder having agreed to anything.
      onLoyaltySelected();
      return;
    }
    setMethod(m);
    setCashInput('');
    setSplitCardInput('');
  };

  /** completePayment() (rakeen-pos.js:3272): on success the popup does NOT
   *  close -- it swaps its body for the receipt screen. Closing here is
   *  what this app used to do, which is why the confirmation the PWA shows
   *  after every sale never appeared. */
  /** Takeaway, or dine-in without tables. */
  const wantsPager = channel === 'pickup' || (channel === 'dine_in' && dineInMode === 'simple');

  const handleConfirm = async () => {
    // A buzzer number is reused all day, so the same one must never be out
    // with two open orders — buzzing it would call the wrong customer to
    // the counter, and nothing downstream could tell that it happened. The
    // database has a unique index that makes it impossible; this check is
    // what refuses it while the cashier can still grab a different buzzer,
    // instead of failing after the customer has walked off with it.
    const pager = pagerEnabled && wantsPager && pagerInput ? Number(pagerInput) : null;
    if (pager != null) {
      if (await isPagerNumberBusy(branchId, pager)) {
        setPagerError(`جهاز ${pager} مع طلب ثاني الحين — اختر رقم غيره`);
        return;
      }
    }

    // Read before awaiting: onConfirm empties the cart, and `total` is
    // derived from it.
    const captured = total;
    const outcome = await onConfirm(method, method === 'cash' ? cashAmount : null, pager);
    if (!outcome.ok) return;
    // Best-effort, and deliberately after the sale is banked: a buzzer
    // that fails to record is a note lost, not money lost, and must never
    // roll back a completed payment.
    if (pager != null && outcome.orderId != null) {
      const saved = await setOrderPager(outcome.orderId, pager);
      if (!saved.ok) setPagerError('انحفظ الطلب، بس ما انسجّل رقم الجهاز');
    }
    setPaidTotal(captured);
    setResult(outcome);
    setPrintStatus(outcome.printJobId ? 'queued' : null);
    setCountdown(AUTO_RESET_SECONDS);
    setStep('success');
  };

  /** The receipt screen's own طباعة button re-queues the same receipt
   *  (attemptPrint), so a failed or skipped print can be retried without
   *  leaving the screen. */
  const handleReprint = async () => {
    if (!result?.printJobId) return;
    try {
      await retryPrintJob(result.printJobId);
      setPrintStatus('queued');
      setPrintRetries(0);
    } catch {
      // retryPrintJob already leaves the job where it was; the status row
      // keeps polling and will show whatever it settles on.
    }
  };

  const goBack = () => {
    // modalGoBack() pops one frame; at the bottom of the stack it closes.
    // 'success' is deliberately absent: the sale is done and its cart is
    // already cleared, so stepping back into it would show an empty order.
    if (step === 'payment') setStep(loyaltyEnabled ? 'customer' : 'channel');
    else if (step === 'newCustomer') setStep('customer');
    else if (step === 'customer') setStep(needsTable(channel) ? 'tablePicker' : 'channel');
    else if (step === 'tablePicker') setStep('channel');
    else onCancel();
  };

  const quickAmounts = React.useMemo(
    () =>
      [
        ...new Set(
          [total, Math.ceil(total / 10) * 10, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100].map(n =>
            n.toFixed(2),
          ),
        ),
      ].slice(0, 4),
    [total],
  );

  const newCustomerCheck = validateNewCustomerDraft({ name: newName, phone: newPhone });
  const newCustomerValid = newCustomerCheck.valid;
  const newCustomerErrors = newCustomerCheck.errors;

  const cashAmount = parseFloat(cashInput) || 0;
  const change = computeCashChange(cashAmount, total);
  const splitCard = Math.min(total, parseFloat(splitCardInput) || 0);
  const splitCash = Math.max(0, Number((total - splitCard).toFixed(2)));
  const validSplit = splitCard > 0 && splitCash > 0;
  const canConfirm =
    channel === 'delivery'
      ? /^\d{4}$/.test(invoiceLast4)
      : method === 'cash'
        ? cashAmount >= total
        : method === 'split'
          ? validSplit
          : true;

  /**
   * DELIBERATE DIVERGENCE from the source, decided by the owner.
   *
   * rakeen-pos.js:1536 filters only dine_in, so 🛵 توصيل is always
   * offered; it hides just the platform buttons when no platform exists.
   * But picking that channel forces `activePaymentMethod =
   * 'delivery_platform'` (:1293) and shows "مدفوع مسبقًا عبر التطبيق"
   * with a field for the platform invoice's last four digits -- for an
   * invoice that does not exist when no platform is configured.
   *
   * The cost is not cosmetic: computeShiftTotals counts delivery_platform
   * as its own bucket, outside both cash and card, so money the
   * restaurant's own driver collected is booked as collected by an
   * aggregator and the shift's cash reconciliation is wrong by that
   * amount.
   *
   * A restaurant that delivers with its own driver takes those orders
   * through the website instead, where they arrive as online orders,
   * already priced and invoiced. So with no platform configured there is
   * nothing this channel can correctly record, and it is hidden.
   */
  const channels = CHANNELS.filter(c => {
    if (c.id === 'dine_in') return dineInEnabled;
    if (c.id === 'delivery') return deliveryPlatforms.length > 0;
    return true;
  });

  /**
   * One order type means there is nothing to ask.
   *
   * A takeaway-only shop — no dine-in, no delivery apps — was still shown a
   * step containing a single button, which is a tap requesting permission
   * to do the only possible thing. The channel is set to it and the step
   * skipped.
   *
   * Placed after `channels` rather than in the open/reset effect above so
   * the list it depends on is defined before it, instead of being reached
   * across the whole component body.
   */
  useEffect(() => {
    if (!visible || step !== 'channel' || channels.length !== 1) return;
    const only = channels[0].id;
    if (channel !== only) onChannelChange(only);
    // Dine-in with no table still needs one; every other single channel
    // goes straight on to the customer step.
    if (only === 'dine_in' && dineInMode === 'tables' && !hasTable) setStep('tablePicker');
    else advanceToCustomer();
    // advanceToCustomer is recreated each render; depending on it would
    // re-run this on every render and fight the step it just set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, step, channels.length, channel, hasTable, onChannelChange]);
  const methods: { id: PaymentMethod; label: string }[] = [
    { id: 'cash', label: 'كاش' },
    { id: 'card', label: 'بطاقة' },
    { id: 'split', label: 'تقسيم' },
  ];
  if (customer?.id != null && customer.points > 0) methods.push({ id: 'loyalty', label: 'الولاء' });

  const tabIcon = (id: PaymentMethod, active: boolean) => {
    const stroke = active ? colors.accentText : colors.muted;
    if (id === 'cash') {
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2}>
          <Rect x={2} y={6} width={20} height={12} rx={2} />
          <Circle cx={12} cy={12} r={3} />
        </Svg>
      );
    }
    if (id === 'card') {
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2}>
          <Rect x={2} y={5} width={20} height={14} rx={2} />
          <Line x1={2} y1={10} x2={22} y2={10} />
        </Svg>
      );
    }
    if (id === 'split') {
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2}>
          <Line x1={12} y1={2} x2={12} y2={22} />
          <Path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </Svg>
      );
    }
    return <Text style={styles.tabEmoji}>🎁</Text>;
  };

  /**
   * Does what was typed already name a customer on screen?
   *
   * Phones compare normalised, so 0501234567 and +966 50 123 4567 are
   * recognised as the same person rather than as two.
   */
  const trimmedQuery = query.trim();
  const queryIsPhone = /^[0-9+\s-]{6,}$/.test(trimmedQuery);
  const queryMatchesExisting = (suggestions || []).some(c =>
    queryIsPhone
      ? normalisePhoneInput(c.phone || '') === normalisePhoneInput(trimmedQuery)
      : (c.name || '').trim().toLowerCase() === trimmedQuery.toLowerCase(),
  );

  const CustomerRow = ({ c, onPress }: { c: AttachedCustomer; onPress?: () => void }) => (
    <TouchableOpacity style={styles.customerSuggest} onPress={onPress} disabled={!onPress} activeOpacity={0.8}>
      {/* A person mark, not the first letter of the name. The letter tile
          looked like a profile photo the shop was supposed to have, and a
          customer known only by phone number got a digit in a circle. */}
      <View style={styles.customerAvatar}>
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <Circle cx="12" cy="7" r="4" />
        </Svg>
      </View>
      <View style={styles.customerInfo}>
        <Text style={styles.customerName} numberOfLines={1}>
          {c.name || c.phone}
        </Text>
        {!!c.phone && !!c.name && <Text style={styles.customerPhone}>{c.phone}</Text>}
      </View>
      {c.points > 0 && (
        <View style={styles.customerPoints}>
          <Text style={styles.customerPointsText}>{c.points} نقطة</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={goBack}>
      {/* The cash step focuses a decimal-pad TextInput, and the keyboard
          that comes up covers the bottom ~290pt of the screen -- which on
          a phone is exactly where the centred card's confirm button sits.
          A browser handles this for free (the visual viewport shrinks and
          the focused field is scrolled into view); RN does not, so the
          overlay has to shrink by the keyboard's height itself. The card
          is height-capped and its body scrolls, so shrinking the overlay
          is enough to keep every control reachable. */}
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.card, shadows.md]}>
          {/* .modal-head -- the back circle only exists above the first
              step, matching modalStepStack's own depth check. */}
          <View style={styles.head}>
            <Text style={styles.title}>{STEP_TITLE[step]}</Text>
            <View style={styles.headBtns}>
              {step !== 'channel' && (
                <TouchableOpacity onPress={goBack} disabled={submitting} style={styles.headCircle}>
                  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2} strokeLinecap="round">
                    <Polyline points="9 18 15 12 9 6" />
                  </Svg>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onCancel} disabled={submitting} style={styles.headCircle}>
                <Text style={styles.closeGlyph}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
            {step === 'channel' && (
              <>
                {/* .channel-row -- #pmChannelRow, which lives HERE and not
                    in the order panel. */}
                <View style={styles.channelRow}>
                  {channels.map(c => {
                    const active = channel === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.channelBtn, active && styles.channelBtnActive]}
                        onPress={() => chooseChannel(c.id)}
                        activeOpacity={0.8}>
                        <Text style={[styles.channelBtnText, active && styles.channelBtnTextActive]}>{c.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {/* .platform-btn-row -- only for delivery, and only when
                    the business actually has platforms configured. Without
                    it every delivery order is filed with no platform and
                    the dashboard cannot split sales by app. */}
                {channel === 'delivery' && deliveryPlatforms.length > 0 && (
                  <View style={styles.platformRow}>
                    {deliveryPlatforms.map(pf => {
                      const active = pf.id === deliveryPlatformId;
                      return (
                        <TouchableOpacity
                          key={pf.id}
                          style={[
                            styles.platformBtn,
                            active && styles.platformBtnActive,
                            active && pf.brandColor ? { borderColor: pf.brandColor } : null,
                          ]}
                          onPress={() => choosePlatform(pf.id)}
                          activeOpacity={0.8}>
                          {pf.logoUrl ? (
                            <Image source={{ uri: pf.logoUrl }} style={styles.platformLogo} resizeMode="contain" />
                          ) : (
                            <View style={[styles.platformInitial, { backgroundColor: pf.brandColor || colors.surf2 }]}>
                              <Text style={styles.platformInitialText}>{(pf.name || '؟').charAt(0)}</Text>
                            </View>
                          )}
                          <Text style={styles.platformName} numberOfLines={1}>
                            {pf.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

              </>
            )}

            {step === 'tablePicker' && (
              <>
                {availableTables.length === 0 ? (
                  <Text style={styles.sub}>ما فيه طاولات متاحة الحين.</Text>
                ) : (
                  <View style={styles.tableGrid}>
                    {availableTables.map(tb => (
                      <TouchableOpacity
                        key={tb.id}
                        style={styles.tableBtn}
                        onPress={() => claimAndContinue(tb.id, String(tb.number))}
                        activeOpacity={0.8}>
                        <Text style={styles.tableBtnText}>{tb.number}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {!!claimError && <Text style={styles.error}>{claimError}</Text>}
                {/* Skipping is allowed: dine-in without a table is a real,
                    supported case, not a mistake to block. */}
                <TouchableOpacity onPress={advanceToCustomer} style={styles.textLink}>
                  <Text style={styles.textLinkText}>متابعة بدون طاولة</Text>
                </TouchableOpacity>
              </>
            )}

            {step === 'customer' && (
              <>
                {customer ? (
                  <>
                    {/* `pointer-events:none` in the source -- the attached
                        customer is a display row, not a button. */}
                    <CustomerRow c={customer} />
                    {/* .loyalty-otp-back -- a plain text link, not a button */}
                    <TouchableOpacity onPress={() => onCustomerChange(null)} style={styles.textLink}>
                      <Text style={styles.textLinkText}>تغيير</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <View style={styles.searchRow}>
                      <TextInput
                        style={[styles.input, styles.searchInput]}
                        placeholder="اكتب اسم أو جوال..."
                        placeholderTextColor={colors.muted}
                        value={query}
                        onChangeText={setQuery}
                        autoFocus
                      />
                      {/* #pmScanCustomerCardBtn -- a 44px square */}
                      <View style={[styles.customerSuggest, styles.scanBtn]}>
                        <Text style={styles.scanGlyph}>📷</Text>
                      </View>
                    </View>
                    <View style={styles.customerPanelRow}>
                      {searching && <Text style={styles.suggestLoading}>جارٍ البحث...</Text>}
                      {!searching &&
                        suggestions?.map(c => (
                          <CustomerRow
                            key={String(c.id)}
                            c={c}
                            onPress={() => {
                              // The source advances the moment a customer
                              // is picked -- it does not wait for متابعة.
                              onCustomerChange(c);
                              proceedToPayment();
                            }}
                          />
                        ))}
                      {/* .customer-suggest-new -- the source's own comment:
                          surface adding this typed text as a real, VISIBLE
                          row instead of a hidden Enter-key shortcut. This
                          app had no way at all to register a new customer
                          once the panel's picker was removed. */}
                      {/* Offered only when the typed text matches nobody.
                          Typing the number of a customer who is already
                          saved used to show "إضافة عميل جديد" with that
                          same number underneath, inviting a duplicate
                          record for one person — and duplicates split
                          their loyalty points across two rows. */}
                      {!searching && suggestions != null && !queryMatchesExisting && (
                        <TouchableOpacity
                          style={[styles.customerSuggest, styles.customerSuggestNew]}
                          onPress={() => {
                            const q = query.trim();
                            const isPhone = /^[0-9+\s-]{6,}$/.test(q);
                            setNewName(isPhone ? '' : q);
                            setNewPhone(isPhone ? normalisePhoneInput(q) : '');
                            setStep('newCustomer');
                          }}
                          activeOpacity={0.8}>
                          <View style={[styles.customerAvatar, styles.customerAvatarNew]}>
                            <Text style={styles.customerAvatarNewText}>+</Text>
                          </View>
                          <View style={styles.customerInfo}>
                            <Text style={styles.customerName}>إضافة عميل جديد</Text>
                            <Text style={styles.customerPhone}>
                              {/^[0-9+\s-]{6,}$/.test(query.trim())
                                ? query.trim()
                                : `باسم "${query.trim()}"`}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      )}
                    </View>
                  </>
                )}
                {/* The label really does change: متابعة once a customer is
                    attached, تخطي while none is. */}
                <TouchableOpacity onPress={proceedToPayment} activeOpacity={0.85} style={styles.nextWrapTight}>
                  <View style={styles.confirmButton}>
                    <GradientFill gradient={gradients.payButton} radius={radii.md} />
                    <Text style={styles.confirmText}>{customer ? 'متابعة' : 'تخطي'}</Text>
                  </View>
                </TouchableOpacity>
              </>
            )}

            {step === 'newCustomer' && (
              <>
                {/* renderNewCustomerStep() (rakeen-pos.js:1166). BOTH fields
                    are required, and the source explains why in a comment
                    worth keeping: complete_pos_order() only creates a real
                    customers row when a phone is present (find-or-create by
                    phone). Without one this "customer" is free text on the
                    order -- never a loyalty member, never found again on a
                    repeat visit, never in the dashboard's customer list. */}
                <Text style={styles.splitLabel}>الاسم</Text>
                <TextInput
                  style={[styles.input, styles.newCustomerInput]}
                  placeholder="اسم العميل"
                  placeholderTextColor={colors.muted}
                  value={newName}
                  onChangeText={setNewName}
                  autoFocus={!!newPhone}
                />
                <Text style={styles.splitLabel}>رقم الجوال</Text>
                <TextInput
                  style={[styles.input, styles.newCustomerInput]}
                  placeholder="05xxxxxxxx"
                  placeholderTextColor={colors.muted}
                  keyboardType="phone-pad"
                  value={newPhone}
                  // Rewrites the field on every keystroke exactly as the
                  // source does: Arabic-Indic digits folded to Western,
                  // everything non-numeric dropped, capped at 10 -- so what
                  // the cashier sees is always what will be stored.
                  onChangeText={t => setNewPhone(normalisePhoneInput(toLatinDigits(t)))}
                  maxLength={10}
                  autoFocus={!newPhone}
                />

                {newCustomerValid ? (
                  <TouchableOpacity
                    onPress={() => {
                      onCustomerChange({
                        // No id: this customer has no row yet.
                        // complete_pos_order() creates one from the phone.
                        id: null,
                        name: newName.trim(),
                        phone: newPhone,
                        points: 0,
                      });
                      proceedToPayment();
                    }}
                    activeOpacity={0.85}>
                    <View style={styles.confirmButton}>
                      <GradientFill gradient={gradients.payButton} radius={radii.md} />
                      <Text style={styles.confirmText}>متابعة</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.confirmButton, styles.confirmButtonDisabled]}>
                    <Text style={[styles.confirmText, styles.confirmTextDisabled]}>متابعة</Text>
                  </View>
                )}
                {/* Says WHY it is disabled rather than leaving the cashier
                    guessing at a dead button. */}
                {!newCustomerValid && (newName.trim() !== '' || newPhone !== '') && (
                  <Text style={styles.newCustomerHint}>{newCustomerErrors[0]}</Text>
                )}
              </>
            )}

            {step === 'payment' && (
              <>
                {/* A delivery order is already paid inside the platform's
                    own app, so it gets no tab strip at all (:1616). */}
                {channel !== 'delivery' && (
                  <View style={styles.methodTabs}>
                    {methods.map(m => {
                      const active = method === m.id;
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[styles.methodTab, active && styles.methodTabActive]}
                          onPress={() => pickMethod(m.id)}
                          activeOpacity={0.8}>
                          {tabIcon(m.id, active)}
                          <Text style={[styles.methodTabText, active && styles.methodTabTextActive]}>{m.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <View style={styles.dueDisplay}>
                  <Text style={styles.dueLabel}>
                    {channel === 'delivery' ? 'إجمالي الطلب — مدفوع مسبقًا عبر التطبيق' : 'المبلغ المطلوب'}
                  </Text>
                  <Money value={total} size={30} style={styles.dueAmount} />
                </View>

                {/* The delivery branch (rakeen-pos.js:1616) is not a
                    tender screen: the customer already paid inside the
                    platform's app. What it needs instead is the invoice's
                    last four digits, which is what reconciles this order
                    against the platform's own statement -- and تأكيد الطلب
                    stays disabled until all four are entered. */}
                {channel === 'delivery' && (
                  <View style={styles.splitInputs}>
                    <Text style={styles.splitLabel}>آخر ٤ أرقام من فاتورة تطبيق التوصيل</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="٠٠٠٠"
                      placeholderTextColor={colors.muted}
                      keyboardType="number-pad"
                      maxLength={4}
                      value={invoiceLast4}
                      onChangeText={t => onInvoiceLast4Change(toLatinDigits(t))}
                    />
                  </View>
                )}

                {channel !== 'delivery' && method !== 'loyalty' && (
                  <View style={styles.friendsSplit}>
                    <TouchableOpacity onPress={() => setFriendsOpen(o => !o)} style={styles.friendsToggle} activeOpacity={0.7}>
                      <Text style={styles.friendsToggleText}>
                        {friendsOpen ? '−' : '+'}  قسّم الفاتورة بين الأصحاب
                      </Text>
                    </TouchableOpacity>
                    {friendsOpen && (
                      <View style={styles.friendsBody}>
                        <View style={styles.friendsCounts}>
                          {[2, 3, 4, 5, 6].map(n => {
                            const active = friendsCount === n;
                            return (
                              <TouchableOpacity
                                key={n}
                                style={[styles.fscBtn, active && styles.fscBtnActive]}
                                onPress={() => setFriendsCount(n)}
                                activeOpacity={0.8}>
                                <Text style={[styles.fscBtnText, active && styles.fscBtnTextActive]}>{n}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        {friendsCount != null && (
                          <View style={styles.friendsResult}>
                            <Text style={styles.friendsResultLabel}>كل واحد يدفع</Text>
                            <Money value={total / friendsCount} size={15} color={colors.accentText} />
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                )}

                {method === 'cash' && (
                  <>
                    <View style={styles.quickAmounts}>
                      {quickAmounts.map(v => (
                        <TouchableOpacity key={v} style={styles.qaBtn} onPress={() => setCashInput(v)} activeOpacity={0.8}>
                          <Text style={styles.qaBtnText}>{v}</Text>
                        </TouchableOpacity>
                      ))}
                      {/* `repeat(4,1fr)` keeps every cell a quarter wide,
                          so a short option list must not stretch. */}
                      {Array.from({ length: 4 - quickAmounts.length }).map((_, i) => (
                        <View key={`sp${i}`} style={styles.qaSpacer} />
                      ))}
                    </View>
                    <TextInput
                      style={styles.input}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colors.muted}
                      value={cashInput}
                      onChangeText={t => setCashInput(toLatinDigits(t))}
                    />
                    <View style={styles.changeRow}>
                      <Text style={styles.changeLabel}>الباقي</Text>
                      <Money value={change} size={15} color={colors.accentText} />
                    </View>
                  </>
                )}

                {method === 'split' && (
                  <View style={styles.splitInputs}>
                    <Text style={styles.splitLabel}>المبلغ كاش</Text>
                    {/* Always total - card, so it is derived rather than a
                        second source of truth. */}
                    <View style={[styles.input, styles.inputDerived]}>
                      <Text style={styles.inputDerivedText}>{splitCash ? splitCash.toFixed(2) : '0.00'}</Text>
                    </View>
                    <Text style={styles.splitLabel}>المبلغ عبر الشبكة (بطاقة)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colors.muted}
                      value={splitCardInput}
                      onChangeText={t => setSplitCardInput(toLatinDigits(t))}
                    />
                  </View>
                )}

                {method === 'card' && (
                  <View style={styles.cardTapState}>
                    <View style={styles.cardTapIcon}>
                      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.muted} strokeWidth={2}>
                        <Rect x={2} y={5} width={20} height={14} rx={2} />
                        <Line x1={2} y1={10} x2={22} y2={10} />
                      </Svg>
                    </View>
                    <Text style={styles.cardNote}>مرّر أو قرّب البطاقة على الجهاز</Text>
                  </View>
                )}

                {/* The buzzer, asked for only where the customer walks
                    away and comes back. A table-service order already has
                    a table number doing this job; a delivery order has
                    nobody standing here to hand one to. */}
                {pagerEnabled && wantsPager && (
                  <View style={styles.pagerBox}>
                    <Text style={styles.pagerLabel}>رقم جهاز النداء</Text>
                    <TextInput
                      style={[styles.input, styles.pagerInput, !!pagerError && styles.pagerInputError]}
                      value={pagerInput}
                      onChangeText={t => {
                        setPagerInput(toLatinDigits(t).replace(/[^0-9]/g, '').slice(0, 3));
                        setPagerError('');
                      }}
                      placeholder="مثال: 20"
                      placeholderTextColor={colors.muted}
                      keyboardType="number-pad"
                      maxLength={3}
                    />
                    <Text style={styles.pagerHint}>
                      اتركه فاضي لو ما أعطيته جهاز.
                    </Text>
                    {!!pagerError && <Text style={styles.pagerErrorText}>{pagerError}</Text>}
                  </View>
                )}

                {canConfirm && !submitting ? (
                  <TouchableOpacity
                    onPress={handleConfirm}
                    activeOpacity={0.85}>
                    <View style={styles.confirmButton}>
                      <GradientFill gradient={gradients.payButton} radius={radii.md} />
                      <Text style={styles.confirmText}>
                        {channel === 'delivery' ? 'تأكيد الطلب' : method === 'split' ? 'تأكيد الدفع المقسّم' : 'تأكيد الدفع'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.confirmButton, styles.confirmButtonDisabled]}>
                    {submitting ? (
                      <ActivityIndicator color={colors.muted} />
                    ) : (
                      <Text style={[styles.confirmText, styles.confirmTextDisabled]}>
                        {method === 'split' ? 'تأكيد الدفع المقسّم' : 'تأكيد الدفع'}
                      </Text>
                    )}
                  </View>
                )}
              </>
            )}

            {step === 'success' && result && (
              <View style={styles.receiptSuccess}>
                {/* .success-check -- a 60px lime disc with a 28px tick */}
                <View style={styles.successCheck}>
                  <GradientFill gradient={gradients.payButton} radius={30} />
                  <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={colors.flagGreenDeep} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <Polyline points="20 6 9 17 4 12" />
                  </Svg>
                </View>

                <Text style={styles.successTitle}>تمت العملية بنجاح</Text>
                <Money value={paidTotal} size={26} style={styles.receiptTotal} />

                {/* .receipt-detail-row -- المدفوع is what was HANDED OVER, which
                    for a card sale is simply the total. */}
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptRowLabel}>المدفوع</Text>
                  <Money value={result.paid} size={12} />
                </View>
                {method === 'cash' && (
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptRowLabel}>الباقي</Text>
                    <Money value={result.change} size={12} />
                  </View>
                )}

                {/* #printStatusRow -- live, not a fixed label. Hidden
                    entirely when no receipt job was queued, exactly as
                    autoPrintOnCheckout() hides it when customer receipts
                    are switched off. */}
                {/* Only a settled outcome. A spinner here read as a stuck
                    screen: this modal closes itself after a few seconds, so
                    "جاري الطباعة..." was usually still turning when the
                    whole thing vanished. Nothing to say while a job is in
                    flight — the paper arriving is the feedback — and a real
                    failure still gets a line and a retry. */}
                {result.printJobId != null && (printStatus === 'printed' || printStatus === 'failed') && (
                  <View style={[styles.receiptRow, styles.printStatusRow]}>
                    <Text style={styles.receiptRowLabel}>الطابعة</Text>
                    <View style={styles.printStatusLabel}>
                      {printStatus === 'printed' ? (
                        <>
                          <Text style={styles.printCheck}>✓</Text>
                          <Text style={styles.printStatusText}>تمت الطباعة</Text>
                        </>
                      ) : (
                        <>
                          <Text style={styles.printWarn}>⚠</Text>
                          <Text style={styles.printStatusText}>تعذرت الطباعة — </Text>
                          <TouchableOpacity onPress={handleReprint}>
                            <Text style={styles.printRetryLink}>إعادة المحاولة</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>
                )}

                {/* .receipt-actions */}
                <View style={styles.receiptActions}>
                  <TouchableOpacity style={styles.receiptActionBtn} onPress={handleReprint} activeOpacity={0.8}>
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2}>
                      <Polyline points="6 9 6 2 18 2 18 9" />
                      <Path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <Rect x={6} y={14} width={12} height={8} />
                    </Svg>
                    <Text style={styles.receiptActionText}>طباعة</Text>
                  </TouchableOpacity>
                  {/* The source's واتساب button only raises a toast --
                      it sends nothing. Reproduced as an inline
                      confirmation rather than promising a delivery that
                      does not happen. */}
                  <TouchableOpacity style={styles.receiptActionBtn} onPress={() => setSentWhatsapp(true)} activeOpacity={0.8}>
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2}>
                      <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </Svg>
                    <Text style={styles.receiptActionText}>{sentWhatsapp ? 'تم الإرسال' : 'واتساب'}</Text>
                  </TouchableOpacity>
                </View>

                {/* .new-order-btn -- startNewOrder() is just "close", since
                    the cart was already cleared the moment the sale
                    succeeded. */}
                <TouchableOpacity onPress={onCancel} activeOpacity={0.85} style={styles.newOrderWrap}>
                  <View style={styles.newOrderBtn}>
                    <GradientFill gradient={gradients.payButton} radius={radii.md} />
                    <Text style={styles.newOrderText}>طلب جديد الآن</Text>
                  </View>
                </TouchableOpacity>

                {!showLoyaltyQr && (
                  <Text style={styles.autoResetNote}>
                    يبدأ طلب جديد تلقائيًا خلال <Text style={styles.autoResetCount}>{countdown}</Text>
                  </Text>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
  // .modal-overlay -- a literal rgba(6,16,10,0.78), centred
  overlay: { flex: 1, backgroundColor: 'rgba(6,16,10,0.78)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  // .modal-card
  card: {
    width: 420,
    maxWidth: '92%',
    maxHeight: '88%',
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  // .modal-head -- `padding:20px 22px 0`
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 20, paddingHorizontal: 22 },
  headBtns: { flexDirection: 'row', gap: 8 },
  title: { fontFamily: fonts.sansBold, fontSize: 16.5, color: colors.text },
  // .modal-close / .modal-back share a 30px surf2 circle
  headCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' },
  closeGlyph: { color: colors.text, fontSize: 13 },
  // .modal-body -- `padding:18px 22px 22px`
  //
  // flexShrink is 1 in CSS but 0 in Yoga, and that difference matters
  // here: the card is capped at 88% of the screen, so a body that cannot
  // shrink keeps its full content height and is simply CLIPPED by the
  // card's overflow:hidden -- the scroll view never scrolls, because as
  // far as it knows it already fits. Letting it shrink is what turns the
  // cap into a scroll instead of a truncation (iPhone landscape caps the
  // card at ~343pt, well under the cash step's natural height).
  body: { flexGrow: 0, flexShrink: 1 },
  bodyContent: { paddingTop: 18, paddingHorizontal: 22, paddingBottom: 22 },

  // .channel-row / .channel-btn
  channelRow: { flexDirection: 'row', gap: 4, padding: 4, backgroundColor: colors.surf1, borderRadius: radii.full, marginTop: 8 },
  channelBtn: { flex: 1, paddingVertical: 8, paddingHorizontal: 4, borderRadius: radii.full, alignItems: 'center' },
  channelBtnActive: {
    backgroundColor: colors.lime,
    shadowColor: colors.limeDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 3,
  },
  channelBtnText: { fontFamily: fonts.sansBold, fontSize: 11.5, color: colors.muted },
  channelBtnTextActive: { color: colors.flagGreenDeep },
  nextWrap: { marginTop: 18 },
  sub: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.muted, textAlign: 'center', marginBottom: 14 },
  error: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.danger, textAlign: 'center', marginTop: 10 },
  // .platform-btn-row / .platform-btn
  platformRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  platformBtn: {
    flexGrow: 1,
    flexBasis: 96,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surf1,
  },
  platformBtnActive: { backgroundColor: `rgba(${colors.limeRgb},0.12)`, borderColor: colors.limeDeep },
  platformLogo: { width: 28, height: 28 },
  // .platform-btn-initial -- a coloured disc when the app has no logo
  platformInitial: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  platformInitialText: { fontFamily: fonts.sansBold, fontSize: 13, color: '#fff' },
  platformName: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.text },
  // .table-picker-grid / .table-picker-btn
  tableGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tableBtn: {
    width: 62,
    height: 62,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surf1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableBtnText: { fontFamily: fonts.sansBold, fontSize: 17, color: colors.text },
  nextWrapTight: { marginTop: 16 },

  // .customer-suggest and friends
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: { flex: 1, marginBottom: 0, textAlign: 'right' },
  scanBtn: { width: 44, flexGrow: 0, flexShrink: 0, justifyContent: 'center' },
  scanGlyph: { fontSize: 17 },
  customerPanelRow: { flexDirection: 'column', gap: 6, marginTop: 8 },
  suggestLoading: { padding: 10, textAlign: 'center', fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.muted },
  customerSuggest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radii.md,
    backgroundColor: colors.surf2,
  },
  customerAvatar: {
    flexShrink: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `rgba(${colors.limeRgb},0.22)`,
  },
  customerAvatarText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.flagGreenDeep },
  customerInfo: { flex: 1, minWidth: 0, gap: 1 },
  customerName: { fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.text },
  customerPhone: { fontFamily: fonts.monoMedium, fontSize: 10.5, color: colors.muted },
  customerPoints: { flexShrink: 0, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radii.full, backgroundColor: colors.lime },
  customerPointsText: { fontFamily: fonts.sansBold, fontSize: 10, color: colors.flagGreenDeep },
  // .customer-suggest-new -- transparent with a dashed outline, so it
  // reads as "create" rather than as another result.
  customerSuggestNew: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line },
  customerAvatarNew: { backgroundColor: colors.surf1, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line },
  customerAvatarNewText: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.muted },
  newCustomerInput: { textAlign: 'right', fontFamily: fonts.sansSemiBold, marginBottom: 12 },
  newCustomerHint: { fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.muted, textAlign: 'center', marginTop: 10 },
  // .loyalty-otp-back
  textLink: { padding: 10, alignSelf: 'flex-start', marginTop: 8 },
  textLinkText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.muted },

  // .due-display
  dueDisplay: { alignItems: 'center', paddingVertical: 16, backgroundColor: colors.surf1, borderRadius: radii.lg, marginBottom: spacing[4] },
  dueLabel: { fontFamily: fonts.sansBold, fontSize: 10.5, color: colors.muted, textAlign: 'center' },
  dueAmount: { marginTop: 5 },
  // .pm-tabs / .pm-tab
  methodTabs: { flexDirection: 'row', gap: 8, marginBottom: spacing[4] },
  methodTab: { flex: 1, paddingVertical: 14, paddingHorizontal: 6, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf1, alignItems: 'center', gap: 6 },
  methodTabActive: { borderColor: colors.limeDeep, backgroundColor: `rgba(${colors.limeRgb},0.12)` },
  methodTabText: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.muted },
  methodTabTextActive: { color: colors.accentText },
  tabEmoji: { fontSize: 18 },
  // .friends-split
  pagerBox: { marginBottom: spacing[4] },
  pagerLabel: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text, marginBottom: 6 },
  pagerInput: { textAlign: 'center', fontFamily: fonts.monoBold, fontSize: 18, letterSpacing: 2 },
  pagerInputError: { borderColor: colors.danger },
  pagerHint: { fontFamily: fonts.sansMedium, fontSize: 10.5, color: colors.muted, marginTop: 5 },
  pagerErrorText: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.danger, marginTop: 5 },

  friendsSplit: { marginBottom: spacing[4] },
  // A bordered pill, not a bare line of muted text: unstyled it sat
  // directly under the amount and read as a section heading, so nobody
  // knew splitting was something you could tap.
  friendsToggle: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surf1,
  },
  friendsToggleText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text },
  friendsBody: { marginTop: 8, padding: 12, borderRadius: radii.md, backgroundColor: colors.surf1, borderWidth: 1, borderColor: colors.line },
  friendsCounts: { flexDirection: 'row', gap: 6 },
  fscBtn: { flex: 1, paddingVertical: 9, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf2, alignItems: 'center' },
  fscBtnActive: { backgroundColor: colors.lime, borderColor: colors.lime },
  fscBtnText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text },
  fscBtnTextActive: { color: colors.flagGreenDeep },
  friendsResult: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line, borderStyle: 'dashed' },
  friendsResultLabel: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text },
  // .quick-amounts / .qa-btn
  quickAmounts: { flexDirection: 'row', gap: 7, marginBottom: spacing[3] },
  qaBtn: { flex: 1, paddingVertical: 10, paddingHorizontal: 4, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf1, alignItems: 'center' },
  qaSpacer: { flex: 1 },
  qaBtnText: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.text, writingDirection: 'ltr' },
  // .cash-input-row input / .split-inputs input
  input: {
    width: '100%',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surf1,
    color: colors.text,
    fontFamily: fonts.monoBold,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: spacing[3],
  },
  inputDerived: { alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  inputDerivedText: { fontFamily: fonts.monoBold, fontSize: 15, color: colors.text },
  splitInputs: { marginBottom: spacing[4] },
  splitLabel: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.muted, marginBottom: 6 },
  // .change-row
  changeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 15, backgroundColor: `rgba(${colors.limeRgb},0.12)`, borderRadius: radii.md, marginBottom: spacing[4] },
  changeLabel: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text },
  // .card-tap-state / .card-tap-icon
  cardTapState: { alignItems: 'center', paddingVertical: 26 },
  cardTapIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  cardNote: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.muted, textAlign: 'center' },
  // .receipt-success -- `text-align:center; padding:6px 0 2px`
  receiptSuccess: { alignItems: 'center', paddingTop: 6, paddingBottom: 2 },
  // .success-check -- 60px lime disc, 16px below it
  successCheck: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: colors.limeDeep,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 6,
  },
  // .receipt-success h3
  successTitle: { fontFamily: fonts.sansBold, fontSize: 16.5, color: colors.text, marginBottom: 4 },
  // .receipt-total
  receiptTotal: { marginBottom: 16 },
  // .receipt-detail-row -- full width, hairline under each
  receiptRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  receiptRowLabel: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.muted },
  // .receipt-detail-row.print-status -- no rule under it, 16px clear
  printStatusRow: { borderBottomWidth: 0, marginBottom: 16 },
  // .print-status-label
  printStatusLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  printStatusText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text },
  printCheck: { color: colors.accentText, fontSize: 12, fontFamily: fonts.sansBold },
  printWarn: { color: colors.danger, fontSize: 12 },
  printRetryLink: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.accentText, textDecorationLine: 'underline' },
  // .receipt-actions / .receipt-action-btn
  receiptActions: { width: '100%', flexDirection: 'row', gap: 8, marginBottom: 10 },
  receiptActionBtn: {
    flex: 1,
    paddingVertical: 13,
    paddingHorizontal: 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surf1,
    alignItems: 'center',
    gap: 5,
  },
  receiptActionText: { fontFamily: fonts.sansBold, fontSize: 10.5, color: colors.text },
  // .new-order-btn
  newOrderWrap: { width: '100%', marginTop: 6 },
  newOrderBtn: { width: '100%', paddingVertical: 14, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  newOrderText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.flagGreenDeep },
  // .auto-reset-note
  autoResetNote: { fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.muted, marginTop: 12 },
  autoResetCount: { fontFamily: fonts.monoBold, color: colors.accentText },
  // .confirm-pay-btn
  confirmButton: { width: '100%', paddingVertical: 16, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lime },
  confirmButtonDisabled: { backgroundColor: colors.surf2 },
  confirmText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.flagGreenDeep },
  confirmTextDisabled: { color: colors.muted },
  }),
);
