import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './Text';
import { accountSuspendedMessage } from '../application/authService';

/**
 * يغطّي الكاشير كله ما دام المطعم موقوفاً من لوحة الأدمن: بدونها يبقى
 * الجهاز المفتوح شغالاً في الظاهر، وكل طلب يفشل بلا سبب مفهوم.
 * يرجع الكاشير وحده أول ما ينفعّل الحساب؛ الزر لمن لا يريد الانتظار.
 */
export default function AccountSuspendedScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.screen} accessibilityRole="alert">
      <Text style={styles.title}>الحساب موقوف</Text>
      <Text style={styles.body}>{accountSuspendedMessage()}</Text>
      <TouchableOpacity style={styles.button} activeOpacity={0.85} onPress={onRetry}>
        <Text style={styles.buttonText}>إعادة المحاولة</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#EEF0E8' },
  title: { fontSize: 24, fontWeight: '800', color: '#14291B', marginBottom: 10, textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 27, color: '#4F5B52', textAlign: 'center', marginBottom: 24, maxWidth: 520 },
  button: { backgroundColor: '#C4FF2B', borderRadius: 18, paddingVertical: 15, paddingHorizontal: 44 },
  buttonText: { fontSize: 16, fontWeight: '800', color: '#14291B' },
});
