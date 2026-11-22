import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './Text';
import { TouchableOpacity, SMALL_HIT_SLOP } from './tappable';
import GradientFill from './GradientFill';
import { createStyles, fonts, gradients, radii, spacing, useTheme } from './theme';
import { toLatinDigits } from '../domain/digits';
import KeyboardLift from './KeyboardLift';
import { useI18n } from './i18n';
import { listDiscountPresets } from '../application/discountService';
import type { DiscountPreset } from '../application/discountService';
import { checkCoupon, COUPON_GIFT_MARK, COUPON_REASON_PREFIX, couponCodeFromReason, couponItemsLabel, normalizeCouponCode } from '../application/couponService';
import type { CouponQuote } from '../application/couponService';
import { discountLabel } from '../domain/discount';
import ManagerPinModal from './ManagerPinModal';
import {
  approvedReason,
  discountCap,
  getDiscountRules,
  isOverDiscountCap,
  NO_DISCOUNT_RULES,
} from '../application/discountRulesService';
import type { DiscountRules } from '../application/discountRulesService';

/**
 * Replaces the old inline `.discount-panel` row (5 `flex:1` chips crammed
 * under the "+ خصم" toggle with no bounded width to divide -- the actual
 * cause of the owner-reported "شكله غريب": each chip collapsed to a
 * blank sliver, border visible, text gone, because `flex:1` inside a
 * content-sized parent has nothing real to divide). A modal has its own
 * fixed width, so the percentage grid below sizes each chip to its own
 * content instead, the same pattern ModifierModal's options row already
 * uses successfully.
 *
 * Adds the two things the owner asked for on top of the fix:
 *  - a custom percentage (typed, not just presets)
 *  - a reason, recorded with the order so the shift closing report and
 *    the dashboard's discounts report can show why, not just how much.
 *    Optional by default; the owner can make it required, and cap what
 *    the cashier may give without the manager PIN (discountRulesService).
 */

const PRESET_PERCENTAGES = [5, 10, 15, 20];
/** مبالغ جاهزة بالريال: «خصم ١٠ ريال من الفاتورة». */
const PRESET_AMOUNTS = [5, 10, 20, 50];

type Mode = 'pct' | 'amount' | 'coupon';

export { discountLabel };

export default function DiscountModal({
  visible,
  discountPct,
  discountFixed,
  discountReason,
  fixedAllowed = true,
  subtotal = 0,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  discountPct: number;
  /** خصم بمبلغ ثابت (ريال). ٠ = الخصم بالنسبة. */
  discountFixed: number;
  discountReason: string;
  /** طلب طاولة يتسجّل قبل الدفع: الخادم يحسب خصمه بالنسبة فقط. */
  fixedAllowed?: boolean;
  /** مجموع الطلب قبل الخصم -- يتحقق عليه الكوبون (الحد الأدنى). */
  subtotal?: number;
  /** gift: كوبون «منتجات مجانية» -- تنضاف للسلة، والخصم = مجموع أسعارها. */
  onConfirm: (pct: number, reason: string, fixed: number, gift?: { productIds: number[] }) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t, lang } = useI18n();
  const [presets, setPresets] = useState<DiscountPreset[]>([]);
  const [pickedPresetId, setPickedPresetId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>(discountFixed > 0 ? 'amount' : 'pct');
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');
  const [pct, setPct] = useState(discountPct);
  const [amount, setAmount] = useState(discountFixed);
  const [reason, setReason] = useState(discountReason);
  const [couponText, setCouponText] = useState('');
  const [quote, setQuote] = useState<CouponQuote | null>(null);
  const [checking, setChecking] = useState(false);
  // كوبون «يختار وحدة»: المنتج اللي اختاره العميل.
  const [giftPick, setGiftPick] = useState<number | null>(null);
  const [rules, setRules] = useState<DiscountRules>(NO_DISCOUNT_RULES);
  const [reasonMissing, setReasonMissing] = useState(false);
  // رمز المدير طبقة «inline» داخل هالنافذة: نافذتين <Modal> مع بعض على iOS = تجمّد.
  const [pinOpen, setPinOpen] = useState(false);

  // Re-seed from the cart's current discount every time the modal opens --
  // not on every render, so typing isn't clobbered mid-edit.
  useEffect(() => {
    if (!visible) return;
    const m: Mode = discountFixed > 0 ? 'amount' : 'pct';
    const startsCustom =
      m === 'amount' ? !PRESET_AMOUNTS.includes(discountFixed) : discountPct > 0 && !PRESET_PERCENTAGES.includes(discountPct);
    setMode(m);
    setCustomMode(startsCustom);
    setCustomText(startsCustom ? String(m === 'amount' ? discountFixed : discountPct) : '');
    setPct(discountPct);
    setAmount(discountFixed);
    setReason(discountReason);
    setPickedPresetId(null);
    setCouponText(couponCodeFromReason(discountReason));
    setQuote(null);
    setGiftPick(null);
    setChecking(false);
    if (discountReason.startsWith(COUPON_REASON_PREFIX)) setMode('coupon');
    listDiscountPresets().then(setPresets).catch(() => setPresets([]));
    setReasonMissing(false);
    setPinOpen(false);
    getDiscountRules().then(setRules).catch(() => {});
  }, [visible, discountPct, discountFixed, discountReason]);

  // ١٠٠٪ خصمٌ وارد: ضيافة، أو تعويض شكوى، أو وجبة موظف تُسجَّل طلبًا.
  const customNum = parseFloat(toLatinDigits(customText).replace(/[^0-9.]/g, '')) || 0;
  const effectivePct = mode === 'pct' ? (customMode ? Math.max(0, Math.min(100, Math.floor(customNum))) : pct) : 0;
  const effectiveAmount = mode === 'amount' ? Math.max(0, Math.round((customMode ? customNum : amount) * 100) / 100) : 0;
  const couponBlocked = quote?.ok && quote.kind !== 'pct' && !fixedAllowed;
  // المنتجات اللي تنضاف فعلاً: كلها، أو اللي اختاره العميل.
  const giftItems = (q: CouponQuote) => (q.pick === 'one' ? q.items.filter(i => i.id === giftPick) : q.items);
  const couponValue = (q: CouponQuote) =>
    q.kind === 'item'
      ? q.pick === 'one' && !giftItems(q).length
        ? `${t('العميل يختار وحدة')}: ${q.items.map(i => i.name).join(' / ')}`
        : `${couponItemsLabel(giftItems(q))} ${t('مجاناً')}`
      : discountLabel(q.kind === 'pct' ? q.pct : 0, q.kind === 'amount' ? q.amount : 0);
  const needsPick = !!quote?.ok && quote.kind === 'item' && quote.pick === 'one' && giftPick === null;
  const ready =
    mode === 'coupon' ? !!quote?.ok && !couponBlocked && !needsPick : mode === 'pct' ? effectivePct > 0 : effectiveAmount > 0;
  // خصم كتبه الكاشير من عنده -- القواعد تنطبق عليه بس، مو على الجاهز والكوبون.
  const own = mode !== 'coupon' && pickedPresetId === null;
  const kind: 'pct' | 'amount' = mode === 'amount' ? 'amount' : 'pct';
  const cap = own ? discountCap(rules, kind) : null;
  const overCap = own && isOverDiscountCap(rules, kind, kind === 'amount' ? effectiveAmount : effectivePct);
  const reasonRequired = own && rules.reasonRequired;

  const verifyCoupon = async () => {
    setChecking(true);
    setGiftPick(null);
    setQuote(await checkCoupon(couponText, subtotal));
    setChecking(false);
  };

  const switchMode = (m: Mode) => {
    if (m === 'amount' && !fixedAllowed) return;
    setMode(m);
    setCustomMode(false);
    setCustomText('');
    setPickedPresetId(null);
  };

  const pickChip = (v: number) => {
    setCustomMode(false);
    if (mode === 'pct') setPct(v);
    else setAmount(v);
    setPickedPresetId(null);
  };

  const presetName = (p: DiscountPreset) => (lang === 'en' && p.nameEn ? p.nameEn : p.name);

  /* القالب يملأ الخصم والسبب معًا -- والسبب يُكتب بالاسم العربي دائمًا
     مهما كانت لغة الشاشة، وإلا انقسم التقرير سطرين لحملةٍ واحدة. */
  const pickNamedPreset = (preset: DiscountPreset) => {
    if (preset.amount != null && preset.amount > 0) {
      if (!fixedAllowed) return;
      setMode('amount');
      setAmount(preset.amount);
    } else {
      setMode('pct');
      setPct(preset.pct);
    }
    setCustomMode(false);
    setReason(preset.name);
    setPickedPresetId(preset.id);
  };

  const confirm = () => {
    if (mode === 'coupon') {
      if (!quote?.ok || couponBlocked) return;
      // السبب «كوبون CODE» -- منه ينعدّ الاستخدام في القاعدة.
      const why = COUPON_REASON_PREFIX + quote.code;
      const gifts = giftItems(quote);
      if (quote.kind === 'item' && gifts.length)
        onConfirm(0, why + COUPON_GIFT_MARK + couponItemsLabel(gifts), gifts.reduce((s, i) => s + i.price, 0), { productIds: gifts.map(i => i.id) });
      else if (quote.kind === 'amount') onConfirm(0, why, quote.amount);
      else onConfirm(quote.pct, why, 0);
      onClose();
      return;
    }
    if (reasonRequired && !reason.trim()) {
      setReasonMissing(true);
      return;
    }
    if (overCap) {
      setPinOpen(true);
      return;
    }
    apply(reason.trim());
  };

  const apply = (why: string) => {
    if (mode === 'amount') onConfirm(0, why, effectiveAmount);
    else onConfirm(effectivePct, why, 0);
    onClose();
  };

  const clear = () => {
    onConfirm(0, '', 0);
    onClose();
  };

  const chips = mode === 'pct' ? PRESET_PERCENTAGES : PRESET_AMOUNTS;
  const current = mode === 'pct' ? pct : amount;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardLift style={styles.overlay} onBackdropPress={onClose}>
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.title}>{t('الخصم')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.headCircle} hitSlop={SMALL_HIT_SLOP}>
              <Text style={styles.closeGlyph}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {presets.length > 0 && (
              <>
                <Text style={styles.label}>{t('خصومات جاهزة')}</Text>
                <View style={styles.presetList}>
                  {presets.map(pr => {
                    const on = pickedPresetId === pr.id;
                    const isAmount = pr.amount != null && pr.amount > 0;
                    const off = isAmount && !fixedAllowed;
                    return (
                      <TouchableOpacity
                        key={pr.id}
                        style={[styles.presetCard, on && styles.presetCardOn, off && styles.disabled]}
                        onPress={() => pickNamedPreset(pr)}
                        disabled={off}
                        activeOpacity={0.85}>
                        <Text style={[styles.presetPct, on && styles.presetPctOn]}>
                          {isAmount ? discountLabel(0, pr.amount as number) : `${pr.pct}٪`}
                        </Text>
                        <Text style={[styles.presetName, on && styles.presetNameOn]} numberOfLines={1}>
                          {presetName(pr)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.orLabel}>{t('أو خصم مخصّص')}</Text>
              </>
            )}

            {/* نسبة أو مبلغ: سؤال واحد واضح قبل الأرقام. */}
            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'pct' && styles.modeBtnOn]}
                onPress={() => switchMode('pct')}
                activeOpacity={0.85}>
                <Text style={[styles.modeText, mode === 'pct' && styles.modeTextOn]}>{t('نسبة ٪')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'amount' && styles.modeBtnOn, !fixedAllowed && styles.disabled]}
                onPress={() => switchMode('amount')}
                disabled={!fixedAllowed}
                activeOpacity={0.85}>
                <Text style={[styles.modeText, mode === 'amount' && styles.modeTextOn]}>{t('مبلغ ﷼')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'coupon' && styles.modeBtnOn]}
                onPress={() => setMode('coupon')}
                activeOpacity={0.85}>
                <Text style={[styles.modeText, mode === 'coupon' && styles.modeTextOn]}>{t('كوبون')}</Text>
              </TouchableOpacity>
            </View>
            {!fixedAllowed && mode !== 'coupon' && (
              <Text style={styles.modeNote}>{t('طلب الطاولة ينخصم بالنسبة بس.')}</Text>
            )}

            {mode === 'coupon' && (
              <View style={styles.couponBox}>
                <View style={styles.couponRow}>
                  <TextInput
                    style={[styles.customInput, styles.couponInput]}
                    placeholder={t('كود الكوبون')}
                    placeholderTextColor={colors.muted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    value={couponText}
                    onChangeText={v => {
                      setCouponText(normalizeCouponCode(toLatinDigits(v)));
                      setQuote(null);
                    }}
                    onSubmitEditing={verifyCoupon}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={[styles.couponCheck, (checking || couponText.length < 3) && styles.disabled]}
                    onPress={verifyCoupon}
                    disabled={checking || couponText.length < 3}
                    activeOpacity={0.85}>
                    <Text style={styles.couponCheckText}>{checking ? '...' : t('تحقق')}</Text>
                  </TouchableOpacity>
                </View>
                {quote && (
                  <Text style={[styles.couponResult, quote.ok && !couponBlocked ? styles.couponOk : styles.couponBad]}>
                    {quote.ok
                      ? couponBlocked
                        ? t('كوبون بمبلغ — طلب الطاولة ينخصم بالنسبة بس')
                        : `✓ ${t('كوبون صالح')}: ${couponValue(quote)}`
                      : quote.reason}
                  </Text>
                )}
                {quote?.ok && !couponBlocked && quote.kind === 'item' && quote.pick === 'one' && (
                  <View style={[styles.grid, { marginTop: 10 }]}>
                    {quote.items.map(i => {
                      const on = giftPick === i.id;
                      return (
                        <TouchableOpacity
                          key={i.id}
                          style={[styles.chip, on && styles.chipActive]}
                          onPress={() => setGiftPick(i.id)}
                          activeOpacity={0.8}>
                          <Text style={[styles.chipText, on && styles.chipTextActive]}>{i.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {mode !== 'coupon' && (
            <>
            {/* Content-sized chips in a wrapping grid -- no flex:1, no
                shared width to fight over. */}
            <View style={styles.grid}>
              {chips.map(v => {
                const active = !customMode && current === v && pickedPresetId === null;
                return (
                  <TouchableOpacity
                    key={v}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => pickChip(v)}
                    activeOpacity={0.8}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {mode === 'pct' ? `${v}٪` : `${v} ﷼`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[styles.chip, customMode && styles.chipActive]}
                onPress={() => {
                  setCustomMode(true);
                  setPickedPresetId(null);
                }}
                activeOpacity={0.8}>
                <Text style={[styles.chipText, customMode && styles.chipTextActive]}>
                  {mode === 'pct' ? t('نسبة أخرى') : t('مبلغ آخر')}
                </Text>
              </TouchableOpacity>
            </View>

            {customMode && (
              <TextInput
                style={styles.customInput}
                placeholder={mode === 'pct' ? '0-100' : t('المبلغ بالريال')}
                placeholderTextColor={colors.muted}
                keyboardType={mode === 'pct' ? 'number-pad' : 'decimal-pad'}
                value={customText}
                onChangeText={v => {
                  if (mode === 'pct') {
                    const digits = toLatinDigits(v).replace(/[^0-9]/g, '').slice(0, 3);
                    setCustomText(parseInt(digits, 10) > 100 ? '100' : digits);
                  } else {
                    const clean = toLatinDigits(v).replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 8);
                    setCustomText(clean);
                  }
                }}
                autoFocus
              />
            )}

            {cap != null && (
              <Text style={styles.capNote}>
                {lang === 'en'
                  ? `🔒 Over ${discountLabel(kind === 'pct' ? cap : 0, kind === 'amount' ? cap : 0)} needs manager approval`
                  : `🔒 فوق ${discountLabel(kind === 'pct' ? cap : 0, kind === 'amount' ? cap : 0)} ${t('يحتاج موافقة المدير')}`}
              </Text>
            )}
            <Text style={styles.label}>{reasonRequired ? t('سبب الخصم (لازم)') : t('سبب الخصم (اختياري)')}</Text>
            <TextInput
              style={[styles.reasonInput, reasonMissing && styles.reasonInputNeed]}
              placeholder={t('مثال: عميل دائم، طلب فيه نقص...')}
              placeholderTextColor={colors.muted}
              value={reason}
              onChangeText={v => {
                setReason(v);
                if (v.trim()) setReasonMissing(false);
              }}
            />
            {reasonMissing && <Text style={styles.needText}>{t('اكتب سبب الخصم أول')}</Text>}
            </>
            )}

            <TouchableOpacity onPress={confirm} activeOpacity={0.85} disabled={!ready}>
              <View style={[styles.confirm, !ready && styles.confirmDisabled]}>
                {ready && <GradientFill gradient={gradients.payButton} radius={radii.md} />}
                <Text style={[styles.confirmText, !ready && styles.confirmTextDisabled]}>
                  {mode === 'coupon'
                    ? ready && quote
                      ? `${t('تطبيق الكوبون')} — ${couponValue(quote)}`
                      : needsPick
                        ? t('اختر المنتج اللي يبيه العميل')
                        : t('تحقق من الكوبون أول')
                    : ready
                    ? `${t('تطبيق الخصم')} — ${discountLabel(effectivePct, effectiveAmount)}${overCap ? ` 🔒 ${t('بموافقة المدير')}` : ''}`
                    : mode === 'pct'
                      ? t('اختر نسبة')
                      : t('اختر مبلغ')}
                </Text>
              </View>
            </TouchableOpacity>

            {(discountPct > 0 || discountFixed > 0) && (
              <TouchableOpacity onPress={clear} activeOpacity={0.8} style={styles.clearLink}>
                <Text style={styles.clearLinkText}>{t('إلغاء الخصم')}</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardLift>
      <ManagerPinModal
        presentation="inline"
        visible={pinOpen}
        onApprove={() => {
          setPinOpen(false);
          apply(approvedReason(reason));
        }}
        onCancel={() => setPinOpen(false)}
      />
    </Modal>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(6,16,10,0.78)', alignItems: 'center', justifyContent: 'center', padding: 16 },
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
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 20, paddingHorizontal: 22 },
    title: { fontFamily: fonts.sansBold, fontSize: 16.5, color: colors.text },
    headCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' },
    closeGlyph: { color: colors.text, fontSize: 13 },
    body: { paddingTop: 18, paddingHorizontal: 22, paddingBottom: 22 },

    /* القالب المسمّى بطاقةٌ عريضة لا رقاقة: اسمُه هو ما يُقرأ، والنسبة
       تشرحه. ورقاقةٌ بعرض محتواها تقصّ «عروض اليوم الوطني» إلى كلمة. */
    presetList: { gap: 8, marginBottom: spacing[3] },
    presetCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 13, paddingHorizontal: 15,
      borderRadius: radii.md, borderWidth: 1, borderColor: colors.line,
      backgroundColor: colors.surf1,
    },
    presetCardOn: { backgroundColor: colors.lime, borderColor: colors.lime },
    presetPct: {
      fontFamily: fonts.monoBold, fontSize: 15, color: colors.text,
      minWidth: 46, textAlign: 'center',
    },
    presetPctOn: { color: colors.flagGreenDeep },
    presetName: { fontFamily: fonts.sansBold, fontSize: 13.5, color: colors.text, flex: 1 },
    presetNameOn: { color: colors.flagGreenDeep },
    orLabel: {
      fontFamily: fonts.sansBold, fontSize: 11, color: colors.muted,
      marginBottom: 8, marginTop: 2,
    },

    // The fix: a wrapping grid of content-sized chips, not a `flex:1` row
    // with no bounded width to divide.
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing[4] },
    chip: {
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surf1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipActive: { backgroundColor: colors.lime, borderColor: colors.lime },
    modeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    modeBtn: {
      flex: 1, paddingVertical: 12, borderRadius: radii.md, borderWidth: 1,
      borderColor: colors.line, backgroundColor: colors.surf1, alignItems: 'center',
    },
    modeBtnOn: { backgroundColor: colors.graphite, borderColor: colors.graphite },
    modeText: { fontFamily: fonts.sansBold, fontSize: 13.5, color: colors.text },
    modeTextOn: { color: colors.lime },
    modeNote: { fontFamily: fonts.sansMedium, fontSize: 11.5, color: colors.muted, marginBottom: 10 },
    capNote: { fontFamily: fonts.sansBold, fontSize: 11.5, color: colors.amber, marginBottom: 10 },
    reasonInputNeed: { borderColor: colors.danger, borderWidth: 1.5 },
    needText: { fontFamily: fonts.sansBold, fontSize: 11.5, color: colors.danger, marginTop: -10, marginBottom: 12 },
    disabled: { opacity: 0.4 },
    couponBox: { marginBottom: spacing[4] },
    couponRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    couponInput: { flex: 1, width: undefined, marginBottom: 0, letterSpacing: 1.5 },
    couponCheck: {
      paddingVertical: 14, paddingHorizontal: 18, borderRadius: radii.md,
      backgroundColor: colors.graphite, alignItems: 'center', justifyContent: 'center',
    },
    couponCheckText: { fontFamily: fonts.sansBold, fontSize: 13.5, color: colors.lime },
    couponResult: { fontFamily: fonts.sansBold, fontSize: 12.5, marginTop: 8 },
    couponOk: { color: colors.accentText },
    couponBad: { color: colors.danger },
    chipText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text },
    chipTextActive: { color: colors.flagGreenDeep },

    customInput: {
      width: '100%',
      paddingVertical: 13,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surf1,
      color: colors.text,
      fontFamily: fonts.monoBold,
      fontSize: 16,
      textAlign: 'center',
      marginBottom: spacing[4],
    },

    label: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.muted, marginBottom: 6 },
    reasonInput: {
      width: '100%',
      paddingVertical: 13,
      paddingHorizontal: 14,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surf1,
      color: colors.text,
      fontFamily: fonts.sansSemiBold,
      fontSize: 13,
      textAlign: 'right',
      marginBottom: spacing[4],
    },

    confirm: { width: '100%', paddingVertical: 16, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.lime },
    confirmDisabled: { backgroundColor: colors.surf2 },
    confirmText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.flagGreenDeep },
    confirmTextDisabled: { color: colors.muted },
    clearLink: { alignSelf: 'center', marginTop: 14 },
    clearLinkText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.danger },
  }),
);
