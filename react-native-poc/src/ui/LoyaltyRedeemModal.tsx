import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { requestLoyaltyRedemption, getLoyaltyRedemptionStatus } from '../application/loyaltyRedemptionService';
import type { Product } from '../domain/catalog';

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
              <ActivityIndicator size="large" />
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
                      onPress={() => handlePick(product.id)}>
                      <Text style={styles.productName}>{product.name}</Text>
                      <Text style={styles.productPrice}>{product.pointsRedeemPrice} نقطة</Text>
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

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '80%' },
  waitBlock: { alignItems: 'center', paddingVertical: 20 },
  waitTitle: { fontSize: 15, fontWeight: '700', marginTop: 16, textAlign: 'center' },
  waitSub: { fontSize: 12, color: '#666', marginTop: 6, textAlign: 'center' },
  waitTimer: { fontSize: 13, fontWeight: '700', color: '#3f51b5', marginTop: 12 },
  errorText: { color: '#c0392b', fontSize: 13, textAlign: 'center', marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '800', marginBottom: 4, textAlign: 'center' },
  subtitle: { fontSize: 12, color: '#666', marginBottom: 14, textAlign: 'center' },
  empty: { textAlign: 'center', color: '#666', marginBottom: 14 },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#f2f5f0',
    marginBottom: 8,
  },
  productRowDisabled: { opacity: 0.4 },
  productName: { fontSize: 13, fontWeight: '700', color: '#333', flex: 1 },
  productPrice: { fontSize: 12, fontWeight: '700', color: '#8bc34a' },
  cancelButton: { padding: 14, alignItems: 'center', marginTop: 6 },
  cancelText: { color: '#666', fontWeight: '700' },
});
