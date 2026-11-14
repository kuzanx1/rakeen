import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, View } from 'react-native';
import KeyboardLift from './KeyboardLift';
import { Text, TextInput } from './Text';
import { Pressable, TouchableOpacity } from './tappable';
import GradientFill from './GradientFill';
import {
  getDeviceConfig,
  provisionDevice,
  selectBranch,
  setBranchPin,
  loginCashierWithPin,
  restoreCashierSession,
  clearDeviceConfig,
} from '../application/authService';
import type { DeviceConfig, BranchOption, CashierProfile } from '../domain/auth';
import { EMPTY_DEVICE_CONFIG } from '../domain/auth';
import { createStyles, fonts, gradients, useTheme } from './theme';
import { authBaseStyles, useAuthFit } from './authLook';
import AuthLangButton from './AuthLangButton';
import { checkSignInInput, explainSignInError } from '../domain/signInInput';
import type { SignInField } from '../domain/signInInput';

/** ['1'..'9', '', '0', '⌫'] -- exactly renderLoginPin()'s own key array
 *  (rakeen-pos.js). '' is the empty grid cell the source renders as a bare
 *  <span></span>, not a button. */
const PIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
const PIN_LENGTH = 4;

/**
 * Checkpoint 2 (docs/react-native-migration/01-roadmap.md) — the first
 * REAL POS screen ported, not a demo. Same two-step flow as
 * public/pos/rakeen-pos.js: an owner/manager provisions this device once
 * (email/password -> pick a branch if more than one), then day-to-day
 * login is the 4-digit branch PIN via the same rate-limited
 * /api/pos/login route. Same backend, same business rules, same
 * lockout/rate-limit behavior.
 *
 * Structure and copy are the source's, not a paraphrase -- see
 * pos-markup.ts's #posProvisionScreen / #posLoginScreen and
 * rakeen-pos.js's showCashierLogin()/renderLoginPin():
 *  - the PIN screen's heading is the literal string "رمز الفرع"; the
 *    branch name belongs in the sub-line ("أدخل رمز فرع: X"), not the
 *    heading, and falls back to "أدخل رمز نقطة البيع لهذا الفرع".
 *  - provisioning fields are placeholder-only; the source has no <label>
 *    elements above them.
 *  - picking a branch is not a separate screen: #provBranchField appears
 *    inside the SAME card and the submit button relabels to "تأكيد الفرع".
 *  - .pin-verifying replaces the pad (the pad gets .hidden) rather than
 *    appearing alongside it.
 */
export default function LoginScreen({ onLoggedIn }: { onLoggedIn: (profile: CashierProfile) => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const fit = useAuthFit();

  const [loading, setLoading] = useState(true);
  const [device, setDevice] = useState<DeviceConfig>(EMPTY_DEVICE_CONFIG);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [branches, setBranches] = useState<BranchOption[] | null>(null);
  const [pendingBusiness, setPendingBusiness] = useState<{ id: number; name: string } | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [error, setError] = useState('');
  /** الخانة التي فيها الخطأ -- تُعلَّم بالأحمر حتى يُكتب فيها. */
  const [badField, setBadField] = useState<SignInField | null>(null);
  const [busy, setBusy] = useState(false);

  const [pin, setPin] = useState('');
  /** فرع ينتظر رمزه وقت التجهيز (authService finishBranch). */
  const [pinBranch, setPinBranch] = useState<{ businessId: number; businessName: string; branch: BranchOption } | null>(null);
  const [newPin, setNewPin] = useState('');
  const [newPin2, setNewPin2] = useState('');

  useEffect(() => {
    (async () => {
      const cfg = await getDeviceConfig();
      // الجلسة المحفوظة أولاً: إعادة تشغيل الجهاز -- بنت أو بدونه -- ترجعه للكاشير.
      if (cfg.branchId != null) {
        const restored = await restoreCashierSession(cfg.branchId).catch(() => null);
        if (restored) {
          onLoggedIn(restored);
          return;
        }
      }
      setDevice(cfg);
      setLoading(false);
    })();
  }, []);

  const handleProvision = async () => {
    setError('');
    setBadField(null);
    const problem = checkSignInInput(email, password);
    if (problem) {
      setError(problem.message);
      setBadField(problem.field);
      return;
    }
    setBusy(true);
    try {
      const result = await provisionDevice(email.trim(), password);
      if (result.status === 'error') {
        setError(explainSignInError(result.message));
      } else if (result.status === 'branch-selected') {
        setDevice(result.device);
      } else if (result.status === 'needs-pin') {
        setPinBranch({ businessId: result.businessId, businessName: result.businessName, branch: result.branch });
      } else {
        setPendingBusiness({ id: result.businessId, name: result.businessName });
        setBranches(result.branches);
        setSelectedBranchId(result.branches[0]?.id ?? null);
      }
    } finally {
      setBusy(false);
    }
  };

  /** #provBranchField's confirm path -- same card, relabelled button. */
  const handleConfirmBranch = async () => {
    if (!pendingBusiness || selectedBranchId == null || !branches) return;
    const branch = branches.find(b => b.id === selectedBranchId);
    if (!branch) return;
    setBusy(true);
    try {
      const result = await selectBranch(pendingBusiness.id, pendingBusiness.name, branch);
      setBranches(null);
      setPendingBusiness(null);
      if (result.status === 'branch-selected') setDevice(result.device);
      else if (result.status === 'needs-pin') {
        setPinBranch({ businessId: result.businessId, businessName: result.businessName, branch: result.branch });
      } else if (result.status === 'error') setError(result.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePinKey = async (key: string) => {
    if (busy) return;
    let next = pin;
    if (key === '⌫') next = pin.slice(0, -1);
    else if (pin.length < PIN_LENGTH) next = pin + key;
    setPin(next);
    setError('');

    if (next.length === PIN_LENGTH && device.branchId != null) {
      setBusy(true);
      try {
        const result = await loginCashierWithPin(device.branchId, next);
        if (result.status === 'error') {
          // attemptCashierLogin()'s own fallback message and recovery:
          // clear the entry and put the pad back.
          setError(result.message || 'رمز الفرع غلط.');
          setPin('');
        } else {
          onLoggedIn(result.profile);
        }
      } finally {
        setBusy(false);
      }
    }
  };

  /** Saves the new branch code, binds the device, and opens the cashier
   *  with that same code -- no second entry. */
  const handleSavePin = async () => {
    if (!pinBranch) return;
    const toLatin = (v: string) => v.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).trim();
    const p1 = toLatin(newPin);
    if (!/^\d{4}$/.test(p1)) return setError('الرمز لازم يكون ٤ أرقام.');
    if (p1 !== toLatin(newPin2)) return setError('الرمزين مو متطابقين.');
    setError('');
    setBusy(true);
    try {
      const result = await setBranchPin(pinBranch.businessId, pinBranch.businessName, pinBranch.branch, p1);
      if (result.status === 'error') {
        setError(result.message);
        return;
      }
      setPinBranch(null);
      setNewPin('');
      setNewPin2('');
      setDevice(result.device);
      const login = await loginCashierWithPin(result.device.branchId!, p1);
      if (login.status === 'ok') onLoggedIn(login.profile);
    } finally {
      setBusy(false);
    }
  };

  const handleReprovision = async () => {
    await clearDeviceConfig();
    setDevice(EMPTY_DEVICE_CONFIG);
    setPin('');
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.centerBox]}>
        <ActivityIndicator color={colors.accentText} />
      </View>
    );
  }

  // #posProvisionScreen -- device not yet bound to a branch.
  if (device.branchId == null && pinBranch) {
    return (
      <KeyboardLift style={styles.screen}>
        <ScrollView contentContainerStyle={styles.centerBox} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          <View style={styles.card}>
            <AuthLangButton />
            <Wordmark styles={styles} />
            <Text style={styles.title}>رمز الفرع</Text>
            <Text style={styles.sub}>
              فرع «{pinBranch.branch.name}» ما له رمز بعد. اختر رمز من ٤ أرقام: يدخل فيه الكاشير على هذا الجهاز وكل جهاز بالفرع.
            </Text>
            <View style={styles.field}>
              <TextInput
                style={styles.input}
                placeholder="الرمز (٤ أرقام)"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                value={newPin}
                onChangeText={setNewPin}
              />
            </View>
            <View style={styles.field}>
              <TextInput
                style={styles.input}
                placeholder="أعد كتابة الرمز"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                value={newPin2}
                onChangeText={setNewPin2}
              />
            </View>
            <Text style={styles.sub}>تجنّب الرموز السهلة مثل 1234 و0000. تقدر تغيّره بعدين من لوحة التحكم ← الكاشير.</Text>
            {!!error && <Text style={styles.error}>{error}</Text>}
            <ConfirmPayButton styles={styles} label="حفظ الرمز وفتح الكاشير" busy={busy} onPress={handleSavePin} />
          </View>
        </ScrollView>
      </KeyboardLift>
    );
  }

  if (device.branchId == null) {
    const pickingBranch = branches != null;
    return (
      <KeyboardLift style={styles.screen}>
        <ScrollView contentContainerStyle={styles.centerBox} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          <View style={styles.card}>
            <AuthLangButton />
            <Wordmark styles={styles} />
            <Text style={styles.title}>تجهيز هذا الجهاز</Text>
            <Text style={styles.sub}>سجّل دخولك كمدير أو مالك مرة وحدة بس، عشان نربط هذا التابلت بفرعك.</Text>

            <View style={styles.field}>
              <TextInput
                style={[styles.input, badField === 'email' && styles.inputBad]}
                placeholder="البريد الإلكتروني"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                keyboardType="email-address"
                returnKeyType="next"
                editable={!pickingBranch}
                value={email}
                onChangeText={v => {
                  setEmail(v);
                  if (badField === 'email') { setBadField(null); setError(''); }
                }}
              />
            </View>
            <View style={styles.field}>
              <TextInput
                style={[styles.input, badField === 'password' && styles.inputBad]}
                placeholder="كلمة المرور"
                placeholderTextColor={colors.muted}
                secureTextEntry
                autoComplete="current-password"
                returnKeyType="go"
                onSubmitEditing={() => !busy && !pickingBranch && handleProvision()}
                editable={!pickingBranch}
                value={password}
                onChangeText={v => {
                  setPassword(v);
                  if (badField === 'password') { setBadField(null); setError(''); }
                }}
              />
            </View>

            {!!error && <Text style={styles.error}>{error}</Text>}

            {/* #provBranchField -- same card, revealed only once the
                account turns out to have more than one branch. RN has no
                <select>; each option is a row styled as the same field
                box, with the chosen one carrying .pos-staff-btn:active's
                lime treatment. */}
            {pickingBranch && (
              <View style={styles.field}>
                {branches!.map(b => {
                  const active = b.id === selectedBranchId;
                  return (
                    <Pressable
                      key={b.id}
                      onPress={() => setSelectedBranchId(b.id)}
                      style={[styles.branchOption, active && styles.branchOptionActive]}>
                      <Text style={[styles.branchOptionText, active && styles.branchOptionTextActive]}>{b.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <ConfirmPayButton
              styles={styles}
              label={pickingBranch ? 'تأكيد الفرع' : 'ربط الجهاز'}
              busy={busy}
              onPress={pickingBranch ? handleConfirmBranch : handleProvision}
            />
          </View>
        </ScrollView>
      </KeyboardLift>
    );
  }

  // #posLoginScreen -- day-to-day cashier PIN entry.
  return (
    <View style={styles.screen}>
      <View style={styles.centerBox}>
        <View style={[styles.card, fit.card]}>
          <AuthLangButton />
          <Wordmark styles={styles} extra={fit.wordmark} />
          <Text style={styles.title}>رمز الفرع</Text>
          <Text style={[styles.sub, fit.sub]}>
            {device.branchName ? `أدخل رمز فرع: ${device.branchName}` : 'أدخل رمز نقطة البيع لهذا الفرع'}
          </Text>

          {/* .pin-dots */}
          <View style={[styles.pinDots, fit.dots]}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <View key={i} style={[styles.pinDot, i < pin.length && styles.pinDotFilled]} />
            ))}
          </View>

          {busy ? (
            // .pin-verifying -- replaces the pad, exactly as the source
            // toggles .hidden between the two.
            <View style={styles.pinVerifying}>
              <ActivityIndicator color={colors.accentText} size="small" />
              <Text style={styles.pinVerifyingText}>جارٍ التحقق من الرمز...</Text>
            </View>
          ) : (
            <PinPad styles={styles} fit={fit} onKey={handlePinKey} />
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity onPress={handleReprovision}>
            <Text style={styles.reprovision}>إعادة تجهيز الجهاز</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function Wordmark({ styles, extra }: { styles: Styles; extra?: object | null }) {
  return (
    <Image
      source={require('../../assets/brand/rakeen-wordmark.png')}
      style={[styles.wordmark, extra]}
      resizeMode="contain"
    />
  );
}

/**
 * .pin-pad -- `display:grid; grid-template-columns:repeat(3,1fr); gap:11px`.
 *
 * Rendered as explicit rows of three flex:1 cells rather than a wrapping
 * flex row: a wrapping row needs a percentage width per key, and a
 * percentage can't account for the 11px gaps the way `1fr` does, so
 * `31% * 3 + 22px` overflowed the card and pushed every third key onto
 * its own line -- which is what made the entered code look jumbled.
 * Three flex:1 children in a gap:11 row reproduce `repeat(3,1fr)` exactly.
 *
 * Digit ORDER is intentionally not the PWA's -- see .pinRow's own note:
 * 1 sits top-left here, iPhone-style, instead of top-right.
 */
function PinPad({ styles, fit, onKey }: { styles: Styles; fit: ReturnType<typeof useAuthFit>; onKey: (key: string) => void }) {
  const rows: string[][] = [];
  for (let i = 0; i < PIN_KEYS.length; i += 3) rows.push(PIN_KEYS.slice(i, i + 3));
  const size = { width: fit.key, height: fit.key, borderRadius: fit.key / 2 };
  return (
    <View style={[styles.pinPad, { gap: fit.rowGap }]}>
      {rows.map((row, r) => (
        <View key={r} style={[styles.pinRow, { gap: fit.colGap }]}>
          {row.map((key, c) => {
            if (!key) return <View key={c} style={size} />;
            const back = key === '⌫';
            return (
              <Pressable
                key={c}
                onPress={() => onKey(key)}
                accessibilityLabel={back ? 'مسح' : key}
                style={({ pressed }) => [
                  styles.pinKey,
                  size,
                  back && styles.pinKeyBack,
                  pressed && (back ? styles.pinKeyBackActive : styles.pinKeyActive),
                  pressed && styles.pinKeyPressed,
                ]}>
                {({ pressed }) => (
                  <Text
                    style={[
                      styles.pinKeyText,
                      { fontSize: back ? fit.keyFont - 2 : fit.keyFont },
                      back && styles.pinKeyBackText,
                      pressed && !back && styles.pinKeyTextActive,
                    ]}>
                    {key}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** .confirm-pay-btn, including its :disabled surface/muted swap. */
function ConfirmPayButton({
  styles,
  label,
  busy,
  onPress,
}: {
  styles: Styles;
  label: string;
  busy: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  if (busy) {
    return (
      <View style={[styles.submitWrap, styles.submit, styles.submitBusy]}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.submitWrap}>
      <View style={styles.submit}>
        <GradientFill gradient={gradients.payButton} radius={17} />
        <Text style={styles.submitText}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

type Styles = ReturnType<typeof useStyles>;

const useStyles = createStyles((colors, shadows) =>
  StyleSheet.create({
    ...authBaseStyles(colors, shadows),
    inputBad: { borderColor: colors.danger },
    // #provBranchField rows -- field box styling, .pos-staff-btn:active tint when chosen
    branchOption: {
      width: '100%',
      minHeight: 56,
      justifyContent: 'center',
      paddingHorizontal: 18,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: colors.line,
      backgroundColor: colors.surf1,
      marginBottom: 8,
    },
    branchOptionActive: { backgroundColor: colors.lime, borderColor: colors.lime },
    branchOptionText: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: colors.text },
    branchOptionTextActive: { color: colors.flagGreenDeep },
    // .pin-dots: row-reverse = يسار لليمين تحت forceRTL، مثل رمز الجوال.
    pinDots: { flexDirection: 'row-reverse', justifyContent: 'center', gap: 18, marginBottom: 30 },
    pinDot: { width: 17, height: 17, borderRadius: 9, borderWidth: 2, borderColor: colors.line },
    pinDotFilled: { backgroundColor: colors.accentText, borderColor: colors.accentText, transform: [{ scale: 1.18 }] },
    pinPad: { alignSelf: 'center' },
    /** direction:'ltr' مقصود: ١ ٢ ٣ من اليسار مثل كل لوحة أرقام (والويب الآن مثلها). */
    pinRow: { flexDirection: 'row', direction: 'ltr' },
    pinKey: {
      borderWidth: 1.5,
      borderColor: colors.line,
      backgroundColor: colors.surf1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pinKeyActive: { backgroundColor: colors.lime, borderColor: colors.lime },
    pinKeyPressed: { transform: [{ scale: 0.93 }] },
    pinKeyBack: { backgroundColor: 'transparent', borderColor: 'transparent' },
    pinKeyBackActive: { backgroundColor: colors.surf2 },
    pinKeyText: { fontFamily: fonts.monoBold, color: colors.text },
    pinKeyTextActive: { color: colors.flagGreenDeep },
    pinKeyBackText: { color: colors.muted },
    pinVerifying: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 26 },
    pinVerifyingText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.muted },
    reprovision: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.muted, marginTop: 22, paddingVertical: 8, paddingHorizontal: 12 },
  }),
);
