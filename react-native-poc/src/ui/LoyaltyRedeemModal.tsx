import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './Text';
import { TouchableOpacity } from './tappable';
import { requestLoyaltyCode, verifyLoyaltyCode, confirmByCardNumber, confirmByCard } from '../application/loyaltyCodeService';
import CardScanner from './CardScanner';
import type { Product } from '../domain/catalog';
import { createStyles, fonts, radii, spacing, useTheme } from './theme';

const REQUEST_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * أبوابُ التأكيد ثلاثة، ولكل حالةٍ بابها.
 *
 *   temp   -- رمزٌ مؤقّت يصل جواله. الأقوى، ويشترط شبكةً عنده.
 *   number -- رقم بطاقته المطبوع تحت باركودها. بلا شبكةٍ ولا كاميرا.
 *   (والمسح بالكاميرا في الويب وحده -- التطبيق بلا ماسحٍ بعد.)
 *
 * ولا بابَ رابعاً: من أعطى رقم جوالٍ فقط لا يُصرف له شيء. وهذا هو
 * المقصود كلُّه -- قبل هذا كان رقم الجوال وحده يكفي.
 */
type Phase = 'waiting' | 'choose' | 'code' | 'number' | 'picking' | 'error';

/**
 * Feature Parity Pass -- Loyalty. Ported from the PWA's real
 * renderLoyaltyWaitStep() -> openPointsRedeemModal() flow
 * (public/pos/rakeen-pos.js, ~1693-1758 and ~1244-1262): request ->
 * spinner + 2-minute countdown while the customer confirms on their own
 * phone -> on confirmed, a redeemable-item list gated by the customer's
 * real points balance (items priced above it shown disabled, same as
 * the source's `affordable` check) -> tapping one calls onRedeem and
 * closes. Cancelling at any point aborts the poll and does nothing.
 *
 * Visuals: .loyalty-wait-step/-text/-sub/-timer match rakeen-pos.css
 * value-for-value. The redeemable-item picker reuses the same
 * customer-suggest-row language as CustomerPickerModal since no
 * dedicated PWA class exists for it.
 */
export default function LoyaltyRedeemModal({
  visible,
  customerId,
  customerName,
  customerPoints,
  redeemableProducts,
  onRedeem,
  onArmReward,
  hasFreeReward,
  onClose,
}: {
  visible: boolean;
  customerId: number;
  customerName: string;
  customerPoints: number;
  redeemableProducts: Product[];
  onRedeem: (productId: number) => void;
  /**
   * الأكواب والزيارات: بعد التأكيد يُسلَّح الطلب ويرجع الكاشير لشبكته.
   *
   * لا منتقي أصنافٍ ثانٍ فوقها -- الكاشير يعرف شبكته بصورها وتصنيفاتها،
   * ولا يعرف قائمةَ أسماءٍ مصفوفة. (نظيرها في الويب: state.rewardArm.)
   */
  onArmReward?: (requestId: number) => void;
  /** عنده مكافأةٌ جاهزة = نظام أكوابٍ أو زيارات، لا نقاط. */
  hasFreeReward?: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [phase, setPhase] = useState<Phase>('waiting');
  const [secondsLeft, setSecondsLeft] = useState(120);
  const [errorMsg, setErrorMsg] = useState('');
  const requestIdRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [noCard, setNoCard] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const cleanup = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    pollRef.current = null;
    timerRef.current = null;
  };

  useEffect(() => {
    if (!visible) {
      cleanup();
      return;
    }
    setPhase('waiting');
    setErrorMsg('');
    setCode('');
    setNoCard(false);
    setSecondsLeft(Math.round(REQUEST_TIMEOUT_MS / 1000));

    (async () => {
      // بلا دفعة: الطلب يُنشأ، والدفعة تُطلب حين يُختار بابُ الرمز.
      const result = await requestLoyaltyCode(customerId, false);
      if (!result.ok || result.requestId == null) {
        setErrorMsg(result.error || 'تعذر إنشاء الرمز');
        setPhase('error');
        return;
      }
      requestIdRef.current = result.requestId;
      const expiresAt = Date.now() + REQUEST_TIMEOUT_MS;
      setPhase('choose');

      // العدّاد وحده -- ما فيه استطلاع: التأكيد يجيء من فم العميل إلى
      // يد الكاشير، لا من الخادم. (وكان استطلاعاً كل ثانيتين ينتظر
      // ضغطةً على صفحةٍ لا يفتحها أحد.)
      timerRef.current = setInterval(() => {
        const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
        setSecondsLeft(left);
        if (left === 0) {
          cleanup();
          setErrorMsg('انتهت مهلة الرمز — اطلب واحداً جديداً');
          setPhase('error');
        }
      }, 1000);
    })();

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, customerId]);

  const handlePick = (productId: number) => {
    onRedeem(productId);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {phase === 'waiting' && (
            <View style={styles.waitBlock}>
              <ActivityIndicator size="large" color={colors.accentText} />
              <Text style={styles.waitTitle}>جارٍ إرسال الرمز لجوال {customerName || 'العميل'}...</Text>
            </View>
          )}

          {phase === 'choose' && (
            <View style={styles.waitBlock}>
              <Text style={styles.waitTitle}>أكّد إنه صاحب البطاقة</Text>
              <Text style={styles.waitSub}>اختر طريقة — لازم وحدة منها</Text>

              <TouchableOpacity
                style={styles.pickBtn}
                onPress={async () => {
                  setPhase('waiting');
                  const r = await requestLoyaltyCode(customerId, true);
                  setNoCard(!r.delivered);
                  setPhase('code');
                }}
              >
                <Text style={styles.pickTitle}>رمز مؤقّت يوصل جواله</Text>
                <Text style={styles.pickSub}>الأقوى — يحتاج نت عنده</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.pickBtn} onPress={() => setScanOpen(true)}>
                <Text style={styles.pickTitle}>امسح باركود بطاقته</Text>
                <Text style={styles.pickSub}>بدون نت — يحتاج كاميرا بالجهاز</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.pickBtn} onPress={() => { setErrorMsg(''); setCode(''); setPhase('number'); }}>
                <Text style={styles.pickTitle}>رقم البطاقة</Text>
                <Text style={styles.pickSub}>ثمانية أحرف تحت الباركود — بدون نت</Text>
              </TouchableOpacity>

              <Text style={styles.waitTimer}>{secondsLeft} ثانية متبقية</Text>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelText}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          )}

          {phase === 'number' && (
            <View style={styles.waitBlock}>
              <Text style={styles.waitTitle}>رقم بطاقته</Text>
              <Text style={styles.waitSub}>خلّه يفتح البطاقة ويقرأ الأحرف تحت الباركود</Text>
              <TextInput
                style={[styles.codeInput, styles.numberInput]}
                value={code}
                onChangeText={t => setCode(t.replace(/[^0-9a-zA-Z]/g, '').toUpperCase().slice(0, 8))}
                autoCapitalize="characters"
                maxLength={8}
                placeholder="A3F19C42"
                placeholderTextColor={colors.muted}
                autoFocus
              />
              {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
              <TouchableOpacity
                style={[styles.confirmButton, (code.length < 8 || checking) && styles.confirmButtonOff]}
                disabled={code.length < 8 || checking}
                onPress={async () => {
                  setChecking(true);
                  const out = await confirmByCardNumber(requestIdRef.current as number, code);
                  setChecking(false);
                  if (out.ok) {
                    cleanup();
                    setErrorMsg('');
                    if (hasFreeReward && onArmReward && requestIdRef.current != null) {
                      onArmReward(requestIdRef.current);
                      return;
                    }
                    setPhase('picking');
                    return;
                  }
                  setErrorMsg(out.error || '');
                }}
              >
                <Text style={styles.confirmText}>{checking ? 'جارٍ التحقق...' : 'تأكيد'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={() => { setErrorMsg(''); setPhase('choose'); }}>
                <Text style={styles.cancelText}>رجوع</Text>
              </TouchableOpacity>
            </View>
          )}

          {phase === 'code' && (
            <View style={styles.waitBlock}>
              <Text style={styles.waitTitle}>اسأل {customerName || 'العميل'} عن الرمز</Text>
              {noCard ? (
                <Text style={styles.errorText}>
                  ما عنده بطاقة بالمحفظة — ما وصله رمز. اعرض له باركود الإضافة أول.
                </Text>
              ) : (
                <Text style={styles.waitSub}>وصله إشعار على جواله فيه أربعة أرقام</Text>
              )}
              <TextInput
                style={styles.codeInput}
                value={code}
                onChangeText={t => setCode(t.replace(/[^0-9]/g, '').slice(0, 4))}
                keyboardType="number-pad"
                maxLength={4}
                placeholder="- - - -"
                placeholderTextColor={colors.muted}
                autoFocus
              />
              {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
              <Text style={styles.waitTimer}>{secondsLeft} ثانية متبقية</Text>
              <TouchableOpacity
                style={[styles.confirmButton, (code.length < 4 || checking) && styles.confirmButtonOff]}
                disabled={code.length < 4 || checking}
                onPress={async () => {
                  setChecking(true);
                  const out = await verifyLoyaltyCode(requestIdRef.current as number, code);
                  setChecking(false);
                  if (out.ok) {
                    cleanup();
                    setErrorMsg('');
                    if (hasFreeReward && onArmReward && requestIdRef.current != null) {
                      onArmReward(requestIdRef.current);
                      return;
                    }
                    setPhase('picking');
                    return;
                  }
                  setCode('');
                  setErrorMsg(
                    out.triesLeft != null ? `${out.error} — بقيت ${out.triesLeft} محاولات` : out.error || '',
                  );
                }}
              >
                <Text style={styles.confirmText}>{checking ? 'جارٍ التحقق...' : 'تأكيد'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelText}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          )}

          {phase === 'error' && (
            <View style={styles.waitBlock}>
              <Text style={styles.errorText}>{errorMsg}</Text>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelText}>إغلاق</Text>
              </TouchableOpacity>
            </View>
          )}

          {phase === 'picking' && (
            <>
              <Text style={styles.title}>استبدال منتج بالنقاط</Text>
              <Text style={styles.subtitle}>رصيد {customerName}: {customerPoints} نقطة</Text>
              {redeemableProducts.length === 0 ? (
                <Text style={styles.empty}>ما فيه منتجات قابلة للاستبدال بالنقاط حاليًا.</Text>
              ) : (
                redeemableProducts.map(product => {
                  const affordable = customerPoints >= (product.pointsRedeemPrice || 0);
                  return (
                    <TouchableOpacity
                      key={product.id}
                      style={[styles.productRow, !affordable && styles.productRowDisabled]}
                      disabled={!affordable}
                      onPress={() => handlePick(product.id)}
                      activeOpacity={0.8}>
                      <Text style={styles.productName}>{product.name}</Text>
                      <View style={styles.productPricePill}>
                        <Text style={styles.productPrice}>{product.pointsRedeemPrice} نقطة</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelText}>إغلاق</Text>
              </TouchableOpacity>
            </>
          )}

          {/* الماسحُ طبقةٌ في هذه النافذة، لا نافذةٌ فوقها: <Modal> فوق
              <Modal> على iOS مقدَّمٌ فوق مقدَّم -- تجمّدٌ صامت. */}
          <CardScanner
            visible={scanOpen}
            onCancel={() => setScanOpen(false)}
            onScan={async token => {
              setScanOpen(false);
              setChecking(true);
              const out = await confirmByCard(requestIdRef.current as number, token);
              setChecking(false);
              if (!out.ok) { setErrorMsg(out.error || 'تعذر التأكيد'); return; }
              cleanup();
              setErrorMsg('');
              if (hasFreeReward && onArmReward && requestIdRef.current != null) {
                onArmReward(requestIdRef.current);
                return;
              }
              setPhase('picking');
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.modalOverlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.cardBg, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing[5], maxHeight: '80%' },
  // .loyalty-wait-step
  waitBlock: { alignItems: 'center', paddingTop: 20, paddingBottom: 6, paddingHorizontal: 10, gap: 6 },
  // .loyalty-wait-text
  waitTitle: { fontFamily: fonts.sansBold, fontSize: 14.5, color: colors.text, marginTop: 16, textAlign: 'center' },
  // .loyalty-wait-sub
  waitSub: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.muted, marginTop: 6, textAlign: 'center' },
  // .loyalty-wait-timer -- mixed content ("{n} ثانية متبقية"), not a pure
  // money/mono value, so unlike this file's other mono styles this one
  // does NOT force writingDirection:'ltr' (the source CSS rule doesn't
  // either) -- that would garble the trailing Arabic words.
  waitTimer: { fontFamily: fonts.monoMedium, fontSize: 11.5, color: colors.muted, marginTop: 12 },
  errorText: { fontFamily: fonts.sansBold, color: colors.danger, fontSize: 13, textAlign: 'center', marginBottom: spacing[2] },
  title: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text, marginBottom: 4, textAlign: 'center' },
  subtitle: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.muted, marginBottom: spacing[4], textAlign: 'center' },
  empty: { fontFamily: fonts.sansSemiBold, textAlign: 'center', color: colors.muted, marginBottom: spacing[4] },
  // .customer-suggest reused for the redeemable-item row
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing[4],
    borderRadius: radii.md,
    backgroundColor: colors.surf2,
    marginBottom: spacing[2],
  },
  productRowDisabled: { opacity: 0.4 },
  productName: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text, flex: 1 },
  // .customer-suggest-points
  productPricePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.full, backgroundColor: colors.lime },
  productPrice: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.flagGreenDeep },
  // أربعة أرقام تُقرأ عن بُعد: الكاشير يكتبها والزبون ينظر.
  codeInput: {
    marginTop: spacing[4],
    width: 168,
    textAlign: 'center',
    fontFamily: fonts.sansBold,
    fontSize: 30,
    letterSpacing: 10,
    color: colors.text,
    backgroundColor: colors.surf1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingVertical: 10,
  },
  confirmButton: {
    marginTop: spacing[4],
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: radii.md,
    backgroundColor: colors.lime,
  },
  confirmButtonOff: { opacity: 0.45 },
  // بطاقةٌ لكل باب: عنوانٌ يقول ما هو، وسطرٌ يقول متى يُستعمل.
  pickBtn: {
    marginTop: spacing[3],
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surf1,
  },
  pickTitle: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.text },
  pickSub: { marginTop: 3, fontFamily: fonts.sansRegular, fontSize: 11.5, color: colors.muted },
  numberInput: { fontSize: 22, letterSpacing: 4, width: 220 },
  confirmText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.accentText },
  cancelButton: { padding: 14, alignItems: 'center', marginTop: 6 },
  cancelText: { fontFamily: fonts.sansBold, color: colors.muted },
  }),
);
