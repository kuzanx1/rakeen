import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {
  getDeviceConfig,
  provisionDevice,
  selectBranch,
  loginCashierWithPin,
  clearDeviceConfig,
} from '../application/authService';
import type { DeviceConfig, BranchOption, CashierProfile } from '../domain/auth';
import { EMPTY_DEVICE_CONFIG } from '../domain/auth';
import { colors, fonts, gradients, radii, shadows, spacing } from './theme';

/**
 * Checkpoint 2 (docs/react-native-migration/01-roadmap.md) — the first
 * REAL POS screen ported, not a demo. Same two-step flow as
 * public/pos/rakeen-pos.js: an owner/manager provisions this device once
 * (email/password -> pick a branch if more than one), then day-to-day
 * login is the 4-digit branch PIN via the same rate-limited
 * /api/pos/login route. Same backend, same business rules, same
 * lockout/rate-limit behavior.
 *
 * Visuals match app/pos/rakeen-pos-additions.css's `.pos-auth-*` /
 * `.pin-dots` / `.pin-pad` / `.pos-staff-btn` rules value-for-value (see
 * theme.ts) — this used to be an intentionally plain placeholder UI; a
 * full visual-parity pass replaced it with the real design.
 */
export default function LoginScreen({ onLoggedIn }: { onLoggedIn: (profile: CashierProfile) => void }) {
  const [loading, setLoading] = useState(true);
  const [device, setDevice] = useState<DeviceConfig>(EMPTY_DEVICE_CONFIG);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [branches, setBranches] = useState<BranchOption[] | null>(null);
  const [pendingBusiness, setPendingBusiness] = useState<{ id: number; name: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [pin, setPin] = useState('');

  useEffect(() => {
    (async () => {
      const cfg = await getDeviceConfig();
      setDevice(cfg);
      setLoading(false);
    })();
  }, []);

  const handleProvision = async () => {
    setError('');
    setBusy(true);
    try {
      const result = await provisionDevice(email.trim(), password);
      if (result.status === 'error') {
        setError(result.message);
      } else if (result.status === 'branch-selected') {
        setDevice(result.device);
      } else {
        setPendingBusiness({ id: result.businessId, name: result.businessName });
        setBranches(result.branches);
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePickBranch = async (branch: BranchOption) => {
    if (!pendingBusiness) return;
    setBusy(true);
    try {
      const cfg = await selectBranch(pendingBusiness.id, pendingBusiness.name, branch);
      setDevice(cfg);
      setBranches(null);
      setPendingBusiness(null);
    } finally {
      setBusy(false);
    }
  };

  const handlePinKey = async (key: string) => {
    if (busy) return;
    let next = pin;
    if (key === '⌫') next = pin.slice(0, -1);
    else if (pin.length < 4) next = pin + key;
    setPin(next);
    setError('');

    if (next.length === 4 && device.branchId != null) {
      setBusy(true);
      try {
        const result = await loginCashierWithPin(device.branchId, next);
        if (result.status === 'error') {
          setError(result.message);
          setPin('');
        } else {
          onLoggedIn(result.profile);
        }
      } finally {
        setBusy(false);
      }
    }
  };

  const handleReprovision = async () => {
    await clearDeviceConfig();
    setDevice(EMPTY_DEVICE_CONFIG);
    setPin('');
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.lime} />
        </View>
      </View>
    );
  }

  // Step 1: no device config yet -- owner/manager provisioning.
  if (device.branchId == null) {
    if (branches) {
      return (
        <View style={styles.screen}>
          <ScrollView contentContainerStyle={styles.center}>
            <View style={styles.card}>
              <Image source={require('../../assets/brand/rakeen-wordmark.png')} style={styles.wordmark} resizeMode="contain" />
              <Text style={styles.title}>اختر الفرع</Text>
              <View style={styles.staffList}>
                {branches.map(b => (
                  <PressableStaffButton key={b.id} label={b.name} onPress={() => handlePickBranch(b)} disabled={busy} />
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      );
    }
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.center}>
          <View style={styles.card}>
            <Image source={require('../../assets/brand/rakeen-wordmark.png')} style={styles.wordmark} resizeMode="contain" />
            <Text style={styles.title}>تجهيز هذا الجهاز</Text>
            <Text style={styles.subtitle}>سجّل دخولك كمدير أو مالك مرة وحدة، عشان نربط هذا التابلت بفرعك.</Text>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>البريد الإلكتروني</Text>
              <TextInput
                style={styles.input}
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>كلمة المرور</Text>
              <TextInput
                style={styles.input}
                placeholderTextColor={colors.muted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>
            {!!error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity onPress={handleProvision} disabled={busy} activeOpacity={0.85} style={styles.primaryButtonWrap}>
              <LinearGradient colors={gradients.payButton.colors} start={gradients.payButton.start} end={gradients.payButton.end} style={styles.primaryButton}>
                {busy ? <ActivityIndicator color={colors.flagGreenDeep} /> : <Text style={styles.primaryButtonText}>ربط الجهاز</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  // Step 2: device provisioned -- day-to-day cashier PIN login.
  return (
    <View style={styles.screen}>
      <View style={styles.center}>
        <View style={styles.card}>
          <Image source={require('../../assets/brand/rakeen-wordmark.png')} style={styles.wordmark} resizeMode="contain" />
          <Text style={styles.title}>{device.branchName}</Text>
          <Text style={styles.subtitle}>أدخل رمز الفرع</Text>
          <View style={styles.pinDots}>
            {[0, 1, 2, 3].map(i => (
              <View key={i} style={[styles.pinDot, i < pin.length && styles.pinDotFilled]} />
            ))}
          </View>
          {!!error && <Text style={styles.error}>{error}</Text>}
          {busy ? (
            <View style={styles.pinVerifying}>
              <ActivityIndicator color={colors.lime} size="small" />
              <Text style={styles.pinVerifyingText}>جارٍ التحقق من الرمز...</Text>
            </View>
          ) : (
            <View style={styles.pinPad}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key, i) =>
                key ? (
                  <PinKey key={i} label={key} onPress={() => handlePinKey(key)} disabled={busy} />
                ) : (
                  <View key={i} style={styles.pinKeySpacer} />
                ),
              )}
            </View>
          )}
          <TouchableOpacity onPress={handleReprovision}>
            <Text style={styles.link}>إعادة تجهيز الجهاز</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function PinKey({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.pinKey, pressed && styles.pinKeyActive]}>
      <Text style={styles.pinKeyText}>{label}</Text>
    </Pressable>
  );
}

function PressableStaffButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.staffButton, pressed && styles.staffButtonActive]}>
      {({ pressed }) => <Text style={[styles.staffButtonText, pressed && styles.staffButtonTextActive]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // .pos-auth-screen
  screen: { flex: 1, backgroundColor: colors.canvas },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing[5] },
  // .pos-auth-card
  card: {
    width: 360,
    maxWidth: '100%',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.xl,
    paddingTop: 36,
    paddingHorizontal: 30,
    paddingBottom: 30,
    ...shadows.panel,
  },
  wordmark: { height: 28, width: 140, marginBottom: 14 },
  // .pos-auth-title
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.text, marginBottom: 7, textAlign: 'center' },
  // .pos-auth-sub
  subtitle: { fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.muted, marginBottom: 22, textAlign: 'center', lineHeight: 20 },
  // .pos-auth-field
  field: { width: '100%', marginBottom: 11 },
  fieldLabel: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.muted, marginBottom: 6, textAlign: 'right' },
  // .pos-auth-field input
  input: {
    width: '100%',
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surf1,
    color: colors.text,
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    textAlign: 'right',
  },
  // .pos-auth-error
  error: { fontFamily: fonts.sansBold, color: colors.danger, fontSize: 12, marginBottom: 10, textAlign: 'center' },
  // .pay-btn, reused here as the app's one primary-CTA style
  primaryButtonWrap: { width: '100%', marginTop: 6 },
  primaryButton: { width: '100%', paddingVertical: 13, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.flagGreenDeep },
  // .pos-staff-list / .pos-staff-btn
  staffList: { width: '100%', gap: 9 },
  staffButton: { width: '100%', paddingVertical: 15, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf1, alignItems: 'center' },
  staffButtonActive: { backgroundColor: colors.lime, borderColor: colors.lime },
  staffButtonText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.text },
  staffButtonTextActive: { color: colors.flagGreenDeep },
  // .pin-dots / .pin-dot
  pinDots: { flexDirection: 'row', gap: 13, marginBottom: 24 },
  pinDot: { width: 13, height: 13, borderRadius: 7, borderWidth: 1.5, borderColor: colors.line },
  pinDotFilled: { backgroundColor: colors.lime, borderColor: colors.lime },
  // .pin-pad / .pin-key
  pinPad: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 11 },
  pinKey: {
    width: '31%',
    paddingVertical: 17,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surf1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinKeyActive: { backgroundColor: colors.surf2 },
  pinKeySpacer: { width: '31%' },
  pinKeyText: { fontFamily: fonts.monoBold, fontSize: 17, color: colors.text },
  // .pin-verifying
  pinVerifying: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 22 },
  pinVerifyingText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.muted },
  // .pos-auth-reprovision
  link: { fontFamily: fonts.sansBold, fontSize: 11.5, color: colors.muted, marginTop: 18 },
});
