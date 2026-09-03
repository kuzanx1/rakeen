import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Pressable, TouchableOpacity } from './tappable';
import GradientFill from './GradientFill';
import {
  getDeviceConfig,
  provisionDevice,
  selectBranch,
  loginCashierWithPin,
  clearDeviceConfig,
} from '../application/authService';
import type { DeviceConfig, BranchOption, CashierProfile } from '../domain/auth';
import { EMPTY_DEVICE_CONFIG } from '../domain/auth';
import { createStyles, fonts, gradients, radii, useTheme } from './theme';

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

  const [loading, setLoading] = useState(true);
  const [device, setDevice] = useState<DeviceConfig>(EMPTY_DEVICE_CONFIG);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [branches, setBranches] = useState<BranchOption[] | null>(null);
  const [pendingBusiness, setPendingBusiness] = useState<{ id: number; name: string } | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
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
  if (device.branchId == null) {
    const pickingBranch = branches != null;
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.centerBox} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Wordmark styles={styles} />
            <Text style={styles.title}>تجهيز هذا الجهاز</Text>
            <Text style={styles.sub}>سجّل دخولك كمدير أو مالك مرة وحدة بس، عشان نربط هذا التابلت بفرعك.</Text>

            <View style={styles.field}>
              <TextInput
                style={styles.input}
                placeholder="البريد الإلكتروني"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoComplete="username"
                keyboardType="email-address"
                editable={!pickingBranch}
                value={email}
                onChangeText={setEmail}
              />
            </View>
            <View style={styles.field}>
              <TextInput
                style={styles.input}
                placeholder="كلمة المرور"
                placeholderTextColor={colors.muted}
                secureTextEntry
                autoComplete="current-password"
                editable={!pickingBranch}
                value={password}
                onChangeText={setPassword}
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
      </View>
    );
  }

  // #posLoginScreen -- day-to-day cashier PIN entry.
  return (
    <View style={styles.screen}>
      <View style={styles.centerBox}>
        <View style={styles.card}>
          <Wordmark styles={styles} />
          <Text style={styles.title}>رمز الفرع</Text>
          <Text style={styles.sub}>
            {device.branchName ? `أدخل رمز فرع: ${device.branchName}` : 'أدخل رمز نقطة البيع لهذا الفرع'}
          </Text>

          {/* .pin-dots */}
          <View style={styles.pinDots}>
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
            <PinPad styles={styles} onKey={handlePinKey} />
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

function Wordmark({ styles }: { styles: Styles }) {
  return (
    <Image
      source={require('../../assets/brand/rakeen-wordmark.png')}
      style={styles.wordmark}
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
function PinPad({ styles, onKey }: { styles: Styles; onKey: (key: string) => void }) {
  const rows: string[][] = [];
  for (let i = 0; i < PIN_KEYS.length; i += 3) rows.push(PIN_KEYS.slice(i, i + 3));
  return (
    <View style={styles.pinPad}>
      {rows.map((row, r) => (
        <View key={r} style={styles.pinRow}>
          {row.map((key, c) =>
            key ? (
              <Pressable
                key={c}
                onPress={() => onKey(key)}
                style={({ pressed }) => [styles.pinKey, pressed && styles.pinKeyActive]}>
                <Text style={styles.pinKeyText}>{key}</Text>
              </Pressable>
            ) : (
              // the source's bare <span></span> placeholder cell
              <View key={c} style={styles.pinKeySpacer} />
            ),
          )}
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
      <View style={[styles.confirmButton, styles.confirmButtonDisabled]}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.confirmButtonWrap}>
      <View style={styles.confirmButton}>
        <GradientFill gradient={gradients.payButton} radius={radii.md} />
        <Text style={styles.confirmButtonText}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

type Styles = ReturnType<typeof useStyles>;

const useStyles = createStyles((colors, shadows) =>
  StyleSheet.create({
    // .pos-auth-screen -- inset:0, centered, background:var(--canvas), padding:20px
    screen: { flex: 1, backgroundColor: colors.canvas },
    centerBox: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
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
    // .brand-avatar inline style: height:28px; width:auto; margin-bottom:14px
    // Measured off the live PWA at 375px: the wordmark box is 64.9x28,
    // not the 132 previously assumed here. `.pos-wordmark{height:28px}`
    // sets only the height; the width is whatever the SVG's own aspect
    // ratio yields, and at 2x wide it rendered the mark cartoonishly
    // oversized against the auth card.
    wordmark: { height: 28, width: 65, marginBottom: 14 },
    // .pos-auth-title
    title: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.text, marginBottom: 7, textAlign: 'center' },
    // .pos-auth-sub -- line-height 1.65 * 12.5px
    sub: { fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.muted, marginBottom: 22, textAlign: 'center', lineHeight: 21 },
    // .pos-auth-field
    field: { width: '100%', marginBottom: 11 },
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
      // The source sets no text-align: the field simply inherits the
      // document's dir="rtl", so even a Latin value (an email) sits
      // against the right edge. RN's 'auto' would flip to left as soon
      // as Latin characters are typed, so it is pinned explicitly.
      textAlign: 'right',
    },
    // #provBranchField rows -- field box styling, .pos-staff-btn:active tint when chosen
    branchOption: {
      width: '100%',
      paddingVertical: 13,
      paddingHorizontal: 15,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surf1,
      marginBottom: 8,
    },
    branchOptionActive: { backgroundColor: colors.lime, borderColor: colors.lime },
    branchOptionText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.text },
    branchOptionTextActive: { color: colors.flagGreenDeep },
    // .pos-auth-error
    error: { fontFamily: fonts.sansBold, color: colors.danger, fontSize: 12, marginBottom: 10, textAlign: 'center' },
    // .confirm-pay-btn
    confirmButtonWrap: { width: '100%' },
    confirmButton: { width: '100%', paddingVertical: 16, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lime },
    confirmButtonDisabled: { backgroundColor: colors.surf2 },
    confirmButtonText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.flagGreenDeep },
    // .pin-dots / .pin-dot / .pin-dot.filled
    pinDots: { flexDirection: 'row', justifyContent: 'center', gap: 13, marginBottom: 24 },
    pinDot: { width: 13, height: 13, borderRadius: 7, borderWidth: 1.5, borderColor: colors.line },
    pinDotFilled: { backgroundColor: colors.accentText, borderColor: colors.accentText },
    // .pin-pad -- repeat(3,1fr) with an 11px gap, as real rows (see PinPad)
    pinPad: { width: '100%', gap: 11 },
    /**
   * `direction:'ltr'` is a DELIBERATE divergence from the PWA, asked for
   * directly. The web .pin-pad is a plain `repeat(3,1fr)` grid inside an
   * RTL document, so its cells lay out right-to-left and "1" lands in the
   * top-RIGHT corner. Every numeric keypad a cashier already knows -- the
   * iPhone passcode screen, an ATM, a calculator -- puts 1 at the top
   * LEFT regardless of language, because digits themselves are LTR. Yoga
   * honours `direction` per-node, so forcing it here flips just these
   * three cells without touching the RTL layout around them.
   */
  pinRow: { flexDirection: 'row', gap: 11, direction: 'ltr' },
    // .pin-key
    pinKey: {
      flex: 1,
      paddingVertical: 17,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surf1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pinKeyActive: { backgroundColor: colors.surf2 },
    pinKeySpacer: { flex: 1 },
    pinKeyText: { fontFamily: fonts.monoBold, fontSize: 17, color: colors.text },
    // .pin-verifying
    pinVerifying: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 22 },
    pinVerifyingText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.muted },
    // .pos-auth-reprovision
    reprovision: { fontFamily: fonts.sansBold, fontSize: 11.5, color: colors.muted, marginTop: 18 },
  }),
);
