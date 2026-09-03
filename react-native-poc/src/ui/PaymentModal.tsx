import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { TouchableOpacity } from './tappable';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import type { PaymentMethod } from '../domain/payment';
import { computeCashChange } from '../domain/payment';
import type { OrderChannel } from '../domain/cart';
import type { Customer } from '../domain/customer';
import { searchCustomers } from '../application/customerService';
import Money from './Money';
import { createStyles, fonts, gradients, radii, spacing, useTheme } from './theme';

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

type Step = 'channel' | 'customer' | 'payment';

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
  { id: 'dine_in', label: '🍽️ بالمطعم' },
  { id: 'pickup', label: '📦 استلام' },
  { id: 'delivery', label: '🛵 توصيل' },
];

const STEP_TITLE: Record<Step, string> = {
  channel: 'نوع الطلب',
  customer: 'العميل',
  payment: 'الدفع',
};

export default function PaymentModal({
  visible,
  total,
  onCancel,
  onConfirm,
  submitting,
  businessId,
  channel,
  onChannelChange,
  customer,
  onCustomerChange,
  dineInEnabled = true,
  loyaltyEnabled = true,
}: {
  visible: boolean;
  total: number;
  onCancel: () => void;
  onConfirm: (method: PaymentMethod, cashAmount: number | null) => void;
  submitting: boolean;
  businessId: number;
  channel: OrderChannel;
  onChannelChange: (c: OrderChannel) => void;
  customer: AttachedCustomer | null;
  onCustomerChange: (c: AttachedCustomer | null) => void;
  /** DINE_IN_ENABLED -- filters 🍽️ بالمطعم out of the channel row. */
  dineInEnabled?: boolean;
  /** LOYALTY_ENABLED -- when false the customer step is skipped whole. */
  loyaltyEnabled?: boolean;
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

  useEffect(() => {
    if (!visible) return;
    // resetModalStack(renderChannelStep) -- every open starts at step 1.
    setStep('channel');
    setMethod('cash');
    setCashInput('');
    setSplitCardInput('');
    setFriendsOpen(false);
    setFriendsCount(null);
    setQuery('');
    setSuggestions(null);
  }, [visible]);

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

  const advanceFromChannel = () => {
    // `if(!LOYALTY_ENABLED){ proceedFromCustomerStep(); return; }`
    if (!loyaltyEnabled) proceedToPayment();
    else setStep('customer');
  };

  /** `state.activePaymentMethod = ...; state.cashAmount=0;
   *  state.splitCardAmount=0` on every tab tap (:1697). */
  const pickMethod = (m: PaymentMethod) => {
    setMethod(m);
    setCashInput('');
    setSplitCardInput('');
  };

  const goBack = () => {
    // modalGoBack() pops one frame; at the bottom of the stack it closes.
    if (step === 'payment') setStep(loyaltyEnabled ? 'customer' : 'channel');
    else if (step === 'customer') setStep('channel');
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

  const cashAmount = parseFloat(cashInput) || 0;
  const change = computeCashChange(cashAmount, total);
  const splitCard = Math.min(total, parseFloat(splitCardInput) || 0);
  const splitCash = Math.max(0, Number((total - splitCard).toFixed(2)));
  const validSplit = splitCard > 0 && splitCash > 0;
  const canConfirm =
    method === 'cash' ? cashAmount >= total : method === 'split' ? validSplit : true;

  const channels = CHANNELS.filter(c => c.id !== 'dine_in' || dineInEnabled);
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

  const CustomerRow = ({ c, onPress }: { c: AttachedCustomer; onPress?: () => void }) => (
    <TouchableOpacity style={styles.customerSuggest} onPress={onPress} disabled={!onPress} activeOpacity={0.8}>
      <View style={styles.customerAvatar}>
        <Text style={styles.customerAvatarText}>{(c.name || c.phone || '؟').charAt(0)}</Text>
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
      <View style={styles.overlay}>
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
                        onPress={() => onChannelChange(c.id)}
                        activeOpacity={0.8}>
                        <Text style={[styles.channelBtnText, active && styles.channelBtnTextActive]}>{c.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {/* #channelNextBtn -- `style="margin-top:18px"` */}
                <TouchableOpacity onPress={advanceFromChannel} activeOpacity={0.85} style={styles.nextWrap}>
                  <LinearGradient
                    colors={gradients.payButton.colors}
                    start={gradients.payButton.start}
                    end={gradients.payButton.end}
                    style={styles.confirmButton}>
                    <Text style={styles.confirmText}>التالي</Text>
                  </LinearGradient>
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
                          <CustomerRow key={String(c.id)} c={c} onPress={() => onCustomerChange(c)} />
                        ))}
                      {!searching && suggestions?.length === 0 && (
                        <Text style={styles.suggestLoading}>ما فيه نتائج</Text>
                      )}
                    </View>
                  </>
                )}
                {/* The label really does change: متابعة once a customer is
                    attached, تخطي while none is. */}
                <TouchableOpacity onPress={proceedToPayment} activeOpacity={0.85} style={styles.nextWrapTight}>
                  <LinearGradient
                    colors={gradients.payButton.colors}
                    start={gradients.payButton.start}
                    end={gradients.payButton.end}
                    style={styles.confirmButton}>
                    <Text style={styles.confirmText}>{customer ? 'متابعة' : 'تخطي'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
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

                {channel !== 'delivery' && method !== 'loyalty' && (
                  <View style={styles.friendsSplit}>
                    <TouchableOpacity onPress={() => setFriendsOpen(o => !o)} style={styles.friendsToggle} activeOpacity={0.7}>
                      <Text style={styles.friendsToggleText}>÷ قسّم بين الأصحاب</Text>
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
                      onChangeText={setCashInput}
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
                      onChangeText={setSplitCardInput}
                    />
                  </View>
                )}

                {(method === 'card' || method === 'loyalty') && (
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

                {canConfirm && !submitting ? (
                  <TouchableOpacity
                    onPress={() => onConfirm(method, method === 'cash' ? cashAmount : null)}
                    activeOpacity={0.85}>
                    <LinearGradient
                      colors={gradients.payButton.colors}
                      start={gradients.payButton.start}
                      end={gradients.payButton.end}
                      style={styles.confirmButton}>
                      <Text style={styles.confirmText}>
                        {channel === 'delivery' ? 'تأكيد الطلب' : method === 'split' ? 'تأكيد الدفع المقسّم' : 'تأكيد الدفع'}
                      </Text>
                    </LinearGradient>
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
          </ScrollView>
        </View>
      </View>
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
  body: { flexGrow: 0 },
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
  friendsSplit: { marginBottom: spacing[4] },
  friendsToggle: { paddingVertical: 4, paddingHorizontal: 2, alignSelf: 'flex-start' },
  friendsToggleText: { fontFamily: fonts.sansBold, fontSize: 11.5, color: colors.muted },
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
  // .confirm-pay-btn
  confirmButton: { width: '100%', paddingVertical: 16, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  confirmButtonDisabled: { backgroundColor: colors.surf2 },
  confirmText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.flagGreenDeep },
  confirmTextDisabled: { color: colors.muted },
  }),
);
