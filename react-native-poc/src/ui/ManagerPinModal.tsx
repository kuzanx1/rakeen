import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { verifyManagerPin } from '../application/managerPinService';

const PIN_LENGTH = 4;

/**
 * Feature Parity Pass -- Refunds/Void/Cancellation. Ported from the PWA's
 * real openPinModal()/verify_pos_manager_pin() flow (public/pos/rakeen-pos.js,
 * ~5450-5517) -- same three-outcome handling (approved/incorrect/not
 * configured/network error), same messages, same "runs onApprove and closes
 * on success" contract. UI simplification, disclosed: a standard OS numeric
 * keyboard via TextInput's keyboardType, not the PWA's custom on-screen
 * keypad grid -- same underlying verify_pos_manager_pin call and PIN length,
 * a styling difference only, not a functional gap.
 */
export default function ManagerPinModal({
  visible,
  onApprove,
  onCancel,
}: {
  visible: boolean;
  onApprove: () => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (visible) {
      setPin('');
      setError('');
      setChecking(false);
    }
  }, [visible]);

  const handleChange = async (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, PIN_LENGTH);
    setPin(digits);
    setError('');
    if (digits.length !== PIN_LENGTH) return;
    setChecking(true);
    const result = await verifyManagerPin(digits);
    setChecking(false);
    setPin('');
    if (result === 'approved') {
      onApprove();
    } else if (result === 'incorrect') {
      setError('رمز خاطئ');
    } else if (result === 'not_configured') {
      setError('ما تم تعيين كلمة سر مدير بعد — من لوحة التحكم: الإعدادات ← نقطة البيع');
    } else {
      setError('تعذر التحقق من الرمز — تحقق من الاتصال');
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>موافقة المدير مطلوبة</Text>
          <View style={styles.dotsRow}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
            ))}
          </View>
          <TextInput
            style={styles.hiddenInput}
            value={pin}
            onChangeText={handleChange}
            keyboardType="number-pad"
            secureTextEntry
            autoFocus
            maxLength={PIN_LENGTH}
            editable={!checking}
          />
          {checking && <ActivityIndicator style={styles.spinner} />}
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelText}>إلغاء</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  sheet: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '80%', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  dotsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: '#999' },
  dotFilled: { backgroundColor: '#3f51b5', borderColor: '#3f51b5' },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: '100%',
  },
  spinner: { marginBottom: 10 },
  errorText: { color: '#c0392b', fontSize: 12, textAlign: 'center', marginBottom: 10 },
  cancelButton: { padding: 12, marginTop: 6 },
  cancelText: { color: '#666', fontWeight: '700' },
});
