import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Pressable, TouchableOpacity } from './tappable';
import { verifyManagerPin } from '../application/managerPinService';
import { createStyles, fonts, radii, spacing, useTheme } from './theme';
import KeyboardLift from './KeyboardLift';

const PIN_LENGTH = 4;
const PIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

/**
 * Feature Parity Pass -- Refunds/Void/Cancellation. Ported from the PWA's
 * real openPinModal()/verify_pos_manager_pin() flow (public/pos/rakeen-pos.js,
 * ~5450-5517) -- same three-outcome handling (approved/incorrect/not
 * configured/network error), same messages, same "runs onApprove and closes
 * on success" contract, and the same on-screen keypad as the PWA and
 * LoginScreen. It used to be a hidden TextInput with autoFocus: Android
 * never raised the keyboard for it inside a Modal, and an invisible field
 * can't be tapped, so a SUNMI cashier had no way to enter the PIN at all.
 *
 * Visuals: .modal-overlay/.modal-card/.pin-dots match rakeen-pos.css
 * value-for-value (same tokens as LoginScreen's own PIN dots).
 */
/**
 * كيف تُعرَض هذه النافذة.
 *
 * 'modal' نافذة قائمة بذاتها -- الوضع الافتراضي، وهو ما تستعمله شاشة
 * الطاولات حيث لا شيء مفتوح فوقها.
 *
 * 'inline' طبقة داخل شجرة نافذة أخرى مفتوحة أصلاً. على iOS كل <Modal>
 * هي UIViewController تُقدَّم فعلياً، وتقديم واحدة فوق أخرى مفتوحة
 * يوقف الواجهة: الثانية لا تظهر، والحاجب الذي يبتلع اللمس يبقى، فيبدو
 * التطبيق معلّقاً. وقد وقع هذا في شاشة السجل حين طُلبت موافقة المدير
 * وتفاصيل الطلب مفتوحة -- تعليقٌ كامل عند كل استرجاع.
 *
 * وشاشة الطاولات تتفادى ذلك بأن تغلق ما هو مفتوح قبل أن تفتح التالي،
 * في كل انتقال بلا استثناء. لكن تفاصيل الطلب لا يصح إغلاقها: الكاشير
 * يقرأ منها الفاتورة وهو يسترجع. فهذا الوضع يعطيه الشكل نفسه بلا
 * تقديم ثانٍ.
 */
export type PinPresentation = 'modal' | 'inline';

export default function ManagerPinModal({
  visible,
  presentation = 'modal',
  onApprove,
  onCancel,
}: {
  visible: boolean;
  presentation?: PinPresentation;
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

  const handleKey = async (key: string) => {
    if (checking) return;
    const digits = key === '⌫' ? pin.slice(0, -1) : (pin + key).slice(0, PIN_LENGTH);
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

  const body = (
      <KeyboardLift style={presentation === 'inline' ? styles.overlayInline : styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>موافقة المدير مطلوبة</Text>
          <View style={styles.dotsRow}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
            ))}
          </View>
          <View style={styles.pinPad}>
            {[0, 3, 6, 9].map(r => (
              <View key={r} style={styles.pinRow}>
                {PIN_KEYS.slice(r, r + 3).map((key, c) =>
                  key ? (
                    <Pressable
                      key={c}
                      onPress={() => handleKey(key)}
                      style={({ pressed }) => [styles.pinKey, pressed && styles.pinKeyActive]}>
                      <Text style={styles.pinKeyText}>{key}</Text>
                    </Pressable>
                  ) : (
                    <View key={c} style={styles.pinKeySpacer} />
                  ),
                )}
              </View>
            ))}
          </View>
          {checking && <ActivityIndicator style={styles.spinner} color={colors.accentText} />}
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelText}>إلغاء</Text>
          </TouchableOpacity>
        </View>
      </KeyboardLift>
  );

  // داخل نافذة مفتوحة: طبقة لا تقديم. و`visible` تُفحص هنا لأن <Modal>
  // كانت هي التي تخفيها.
  if (presentation === 'inline') return visible ? body : null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      {body}
    </Modal>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
  // .modal-overlay
  overlay: { flex: 1, backgroundColor: colors.modalOverlay, justifyContent: 'center', alignItems: 'center' },
  // نفس الشكل، لكن فوق محتوى نافذة قائمة بدل أن تكون نافذة جديدة.
  overlayInline: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.modalOverlay, justifyContent: 'center', alignItems: 'center' },
  // .pos-auth-card
  card: { backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.line, borderRadius: radii.xl, padding: spacing[6], width: '80%', alignItems: 'center' },
  title: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text, marginBottom: spacing[4], textAlign: 'center' },
  // .pin-dots / .pin-dot
  dotsRow: { flexDirection: 'row', gap: 13, marginBottom: spacing[4] },
  dot: { width: 13, height: 13, borderRadius: 7, borderWidth: 1.5, borderColor: colors.line },
  // .pin-dot.filled uses --lime-deep, overridden to --lime in dark
  dotFilled: { backgroundColor: colors.accentText, borderColor: colors.accentText },
  // LoginScreen's .pin-pad, key for key (digits LTR, 1 top-left).
  pinPad: { alignSelf: 'center', gap: 11, marginBottom: spacing[3] },
  pinRow: { flexDirection: 'row', gap: 11, direction: 'ltr' },
  pinKey: {
    width: 53,
    paddingVertical: 17,
    paddingHorizontal: 17,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surf1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinKeyActive: { backgroundColor: colors.surf2 },
  pinKeySpacer: { width: 53 },
  pinKeyText: { fontFamily: fonts.monoBold, fontSize: 17, color: colors.text },
  spinner: { marginBottom: spacing[2] },
  errorText: { fontFamily: fonts.sansBold, color: colors.danger, fontSize: 12, textAlign: 'center', marginBottom: spacing[2] },
  cancelButton: { padding: spacing[3], marginTop: 6 },
  cancelText: { fontFamily: fonts.sansBold, color: colors.muted },
  }),
);
