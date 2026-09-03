import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { TouchableOpacity } from './tappable';
import { verifyManagerPin } from '../application/managerPinService';
import { createStyles, fonts, radii, spacing, useTheme } from './theme';

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
 *
 * Visuals: .modal-overlay/.modal-card/.pin-dots match rakeen-pos.css
 * value-for-value (same tokens as LoginScreen's own PIN dots).
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
  const { colors } = useTheme();
  const styles = useStyles();
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
        <View style={styles.card}>
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
          {checking && <ActivityIndicator style={styles.spinner} color={colors.accentText} />}
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelText}>إلغاء</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
  // .modal-overlay
  overlay: { flex: 1, backgroundColor: colors.modalOverlay, justifyContent: 'center', alignItems: 'center' },
  // .pos-auth-card
  card: { backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.line, borderRadius: radii.xl, padding: spacing[6], width: '80%', alignItems: 'center' },
  title: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text, marginBottom: spacing[4], textAlign: 'center' },
  // .pin-dots / .pin-dot
  dotsRow: { flexDirection: 'row', gap: 13, marginBottom: spacing[4] },
  dot: { width: 13, height: 13, borderRadius: 7, borderWidth: 1.5, borderColor: colors.line },
  // .pin-dot.filled uses --lime-deep, overridden to --lime in dark
  dotFilled: { backgroundColor: colors.accentText, borderColor: colors.accentText },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: '100%' },
  spinner: { marginBottom: spacing[2] },
  errorText: { fontFamily: fonts.sansBold, color: colors.danger, fontSize: 12, textAlign: 'center', marginBottom: spacing[2] },
  cancelButton: { padding: spacing[3], marginTop: 6 },
  cancelText: { fontFamily: fonts.sansBold, color: colors.muted },
  }),
);
