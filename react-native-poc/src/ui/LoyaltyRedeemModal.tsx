import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { requestLoyaltyRedemption, getLoyaltyRedemptionStatus } from '../application/loyaltyRedemptionService';
import type { Product } from '../domain/catalog';
import { createStyles, fonts, radii, spacing, useTheme } from './theme';

const REQUEST_TIMEOUT_MS = 2 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;

type Phase = 'waiting' | 'picking' | 'error';

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
  onClose,
}: {
  visible: boolean;
  customerId: number;
  customerName: string;
  customerPoints: number;
  redeemableProducts: Product[];
  onRedeem: (productId: number) => void;
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
    setSecondsLeft(Math.round(REQUEST_TIMEOUT_MS / 1000));

    (async () => {
      const result = await requestLoyaltyRedemption(customerId);
      if (!result.ok || result.requestId == null) {
        setErrorMsg(result.error || 'تعذر بدء عملية الاستبدال');
        setPhase('error');
        return;
      }
      requestIdRef.current = result.requestId;
      const expiresAt = Date.now() + REQUEST_TIMEOUT_MS;

      timerRef.current = setInterval(() => {
        setSecondsLeft(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
      }, 1000);

      pollRef.current = setInterval(async () => {
        if (Date.now() > expiresAt) {
          cleanup();
          setErrorMsg('انتهت مهلة التأكيد — حاول مرة ثانية');
          setPhase('error');
          return;
        }
        const status = await getLoyaltyRedemptionStatus(requestIdRef.current as number);
        if (!status || status === 'pending') return;
        cleanup();
        if (status === 'confirmed') {
          setPhase('picking');
        } else {
          setErrorMsg('العميل رفض عملية الاستبدال');
          setPhase('error');
        }
      }, POLL_INTERVAL_MS);
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
              <Text style={styles.waitTitle}>بانتظار تأكيد {customerName || 'العميل'}...</Text>
              <Text style={styles.waitSub}>اطلب منه يفتح بطاقة الولاء ويضغط تأكيد</Text>
              <Text style={styles.waitTimer}>{secondsLeft} ثانية متبقية</Text>
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
  cancelButton: { padding: 14, alignItems: 'center', marginTop: 6 },
  cancelText: { fontFamily: fonts.sansBold, color: colors.muted },
  }),
);
