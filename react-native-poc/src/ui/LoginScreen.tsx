import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  getDeviceConfig,
  provisionDevice,
  selectBranch,
  loginCashierWithPin,
  clearDeviceConfig,
} from '../application/authService';
import type { DeviceConfig, BranchOption, CashierProfile } from '../domain/auth';
import { EMPTY_DEVICE_CONFIG } from '../domain/auth';

/**
 * Checkpoint 2 (docs/react-native-migration/01-roadmap.md) — the first
 * REAL POS screen ported, not a demo. Same two-step flow as
 * public/pos/rakeen-pos.js: an owner/manager provisions this device once
 * (email/password -> pick a branch if more than one), then day-to-day
 * login is the 4-digit branch PIN via the same rate-limited
 * /api/pos/login route. Same backend, same business rules, same
 * lockout/rate-limit behavior -- only the UI and the language it's
 * written in changed.
 *
 * UI is intentionally plain -- functional parity first, per the explicit
 * instruction not to redesign the UI before the logic is proven real.
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
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  // Step 1: no device config yet -- owner/manager provisioning.
  if (device.branchId == null) {
    if (branches) {
      return (
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>اختر الفرع</Text>
          {branches.map(b => (
            <TouchableOpacity key={b.id} style={styles.button} onPress={() => handlePickBranch(b)} disabled={busy}>
              <Text style={styles.buttonText}>{b.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      );
    }
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>تجهيز هذا الجهاز</Text>
        <Text style={styles.subtitle}>سجّل دخولك كمدير أو مالك مرة وحدة، عشان نربط هذا التابلت بفرعك.</Text>
        <TextInput
          style={styles.input}
          placeholder="البريد الإلكتروني"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="كلمة المرور"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <TouchableOpacity style={styles.button} onPress={handleProvision} disabled={busy}>
          {busy ? <ActivityIndicator color="#1a1a1a" /> : <Text style={styles.buttonText}>ربط الجهاز</Text>}
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // Step 2: device provisioned -- day-to-day cashier PIN login.
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{device.branchName}</Text>
      <Text style={styles.subtitle}>أدخل رمز الفرع</Text>
      <View style={styles.pinDots}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={[styles.pinDot, i < pin.length && styles.pinDotFilled]} />
        ))}
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.pinPad}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key, i) =>
          key ? (
            <TouchableOpacity key={i} style={styles.pinKey} onPress={() => handlePinKey(key)} disabled={busy}>
              <Text style={styles.pinKeyText}>{key}</Text>
            </TouchableOpacity>
          ) : (
            <View key={i} style={styles.pinKey} />
          ),
        )}
      </View>
      <TouchableOpacity onPress={handleReprovision}>
        <Text style={styles.link}>إعادة تجهيز الجهاز</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#f2f5f0' },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#666', marginBottom: 16, textAlign: 'center' },
  input: {
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  error: { color: '#c0392b', fontSize: 13, marginBottom: 10, textAlign: 'center' },
  button: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#8bc34a',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonText: { fontWeight: '700', color: '#1a1a1a' },
  pinDots: { flexDirection: 'row', gap: 12, marginVertical: 16 },
  pinDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: '#8bc34a' },
  pinDotFilled: { backgroundColor: '#8bc34a' },
  pinPad: { flexDirection: 'row', flexWrap: 'wrap', width: 260, justifyContent: 'space-between' },
  pinKey: { width: 76, height: 60, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  pinKeyText: { fontSize: 22, fontWeight: '700' },
  link: { color: '#666', marginTop: 20, textDecorationLine: 'underline' },
});
