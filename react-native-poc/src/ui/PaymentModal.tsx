import React, { useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { PaymentMethod } from '../domain/payment';
import { computeCashChange } from '../domain/payment';

/**
 * Checkpoint 6 (Payment) -- cash and card only this checkpoint (split/
 * loyalty deferred, see domain/payment.ts's own doc comment). Shows the
 * SAME total Cart already computed (domain/cart.ts's cartTotals) --
 * financial values are never recalculated here, only displayed and, for
 * cash, compared against the amount tendered.
 */
export default function PaymentModal({
  visible,
  total,
  onCancel,
  onConfirm,
  submitting,
}: {
  visible: boolean;
  total: number;
  onCancel: () => void;
  onConfirm: (method: PaymentMethod, cashAmount: number | null) => void;
  submitting: boolean;
}) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [cashInput, setCashInput] = useState(total.toFixed(2));

  const cashAmount = parseFloat(cashInput) || 0;
  const change = computeCashChange(cashAmount, total);
  const canConfirm = method === 'card' || cashAmount >= total;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>الدفع</Text>
          <Text style={styles.dueLabel}>المبلغ المطلوب</Text>
          <Text style={styles.dueAmount}>{total.toFixed(2)} ر.س</Text>

          <View style={styles.methodTabs}>
            <TouchableOpacity
              style={[styles.methodTab, method === 'cash' && styles.methodTabActive]}
              onPress={() => setMethod('cash')}>
              <Text style={[styles.methodTabText, method === 'cash' && styles.methodTabTextActive]}>كاش</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.methodTab, method === 'card' && styles.methodTabActive]}
              onPress={() => setMethod('card')}>
              <Text style={[styles.methodTabText, method === 'card' && styles.methodTabTextActive]}>بطاقة</Text>
            </TouchableOpacity>
          </View>

          {method === 'cash' && (
            <>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={cashInput}
                onChangeText={setCashInput}
              />
              <View style={styles.changeRow}>
                <Text style={styles.changeLabel}>الباقي</Text>
                <Text style={styles.changeValue}>{change.toFixed(2)} ر.س</Text>
              </View>
            </>
          )}

          {method === 'card' && (
            <Text style={styles.cardNote}>تأكيد بعد إتمام العملية على جهاز الدفع الخارجي</Text>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={submitting}>
              <Text style={styles.cancelText}>إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, !canConfirm && styles.confirmButtonDisabled]}
              onPress={() => onConfirm(method, method === 'cash' ? cashAmount : null)}
              disabled={!canConfirm || submitting}>
              {submitting ? <ActivityIndicator color="#1a1a1a" /> : <Text style={styles.confirmText}>تأكيد الدفع</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  title: { fontSize: 16, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  dueLabel: { fontSize: 12, color: '#666', textAlign: 'center' },
  dueAmount: { fontSize: 24, fontWeight: '800', textAlign: 'center', color: '#2e7d32', marginBottom: 16 },
  methodTabs: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  methodTab: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 10, backgroundColor: '#f2f5f0' },
  methodTabActive: { backgroundColor: '#3f51b5' },
  methodTabText: { fontWeight: '700', color: '#444' },
  methodTabTextActive: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 12, fontSize: 18, textAlign: 'center' },
  changeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingHorizontal: 4 },
  changeLabel: { fontSize: 13, color: '#666' },
  changeValue: { fontSize: 13, fontWeight: '700' },
  cardNote: { fontSize: 12, color: '#666', textAlign: 'center', paddingVertical: 20 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelButton: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: '#eee', borderRadius: 10 },
  cancelText: { fontWeight: '700', color: '#444' },
  confirmButton: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: '#8bc34a', borderRadius: 10 },
  confirmButtonDisabled: { backgroundColor: '#ccc' },
  confirmText: { fontWeight: '700', color: '#1a1a1a' },
});
