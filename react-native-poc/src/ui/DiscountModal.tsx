import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './Text';
import { TouchableOpacity } from './tappable';
import GradientFill from './GradientFill';
import { createStyles, fonts, gradients, radii, spacing, useTheme } from './theme';
import { toLatinDigits } from '../domain/digits';
import KeyboardLift from './KeyboardLift';
import { useI18n } from './i18n';

/**
 * Replaces the old inline `.discount-panel` row (5 `flex:1` chips crammed
 * under the "+ خصم" toggle with no bounded width to divide -- the actual
 * cause of the owner-reported "شكله غريب": each chip collapsed to a
 * blank sliver, border visible, text gone, because `flex:1` inside a
 * content-sized parent has nothing real to divide). A modal has its own
 * fixed width, so the percentage grid below sizes each chip to its own
 * content instead, the same pattern ModifierModal's options row already
 * uses successfully.
 *
 * Adds the two things the owner asked for on top of the fix:
 *  - a custom percentage (typed, not just presets)
 *  - an OPTIONAL reason, never required (confirmed) -- recorded with the
 *    order so the shift closing report and the dashboard's discounts
 *    report can show why, not just how much.
 */

const PRESET_PERCENTAGES = [5, 10, 15, 20];

export default function DiscountModal({
  visible,
  discountPct,
  discountReason,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  discountPct: number;
  discountReason: string;
  onConfirm: (pct: number, reason: string) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useI18n();
  const isPreset = PRESET_PERCENTAGES.includes(discountPct);
  const [customMode, setCustomMode] = useState(discountPct > 0 && !isPreset);
  const [customPct, setCustomPct] = useState(discountPct > 0 && !isPreset ? String(discountPct) : '');
  const [pct, setPct] = useState(discountPct);
  const [reason, setReason] = useState(discountReason);

  // Re-seed from the cart's current discount every time the modal opens --
  // not on every render, so typing isn't clobbered mid-edit.
  useEffect(() => {
    if (!visible) return;
    const startsCustom = discountPct > 0 && !PRESET_PERCENTAGES.includes(discountPct);
    setCustomMode(startsCustom);
    setCustomPct(startsCustom ? String(discountPct) : '');
    setPct(discountPct);
    setReason(discountReason);
  }, [visible, discountPct, discountReason]);

  // ١٠٠٪ خصمٌ وارد: ضيافة، أو تعويض شكوى، أو وجبة موظف تُسجَّل طلبًا.
  // كان السقف ٩٩ والحقل يقبل رقمين فقط، فيستحيل كتابتها أصلًا.
  const effectivePct = customMode ? Math.max(0, Math.min(100, parseInt(toLatinDigits(customPct), 10) || 0)) : pct;

  const pickPreset = (p: number) => {
    setCustomMode(false);
    setPct(p);
  };

  const confirm = () => {
    onConfirm(effectivePct, reason.trim());
    onClose();
  };

  const clear = () => {
    onConfirm(0, '');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardLift style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.title}>{t('الخصم')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.headCircle}>
              <Text style={styles.closeGlyph}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {/* Content-sized chips in a wrapping grid -- the actual fix:
                no flex:1, no shared width to fight over. */}
            <View style={styles.grid}>
              {PRESET_PERCENTAGES.map(p => {
                const active = !customMode && pct === p;
                return (
                  <TouchableOpacity
                    key={p}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => pickPreset(p)}
                    activeOpacity={0.8}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{p}٪</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[styles.chip, customMode && styles.chipActive]}
                onPress={() => setCustomMode(true)}
                activeOpacity={0.8}>
                <Text style={[styles.chipText, customMode && styles.chipTextActive]}>{t('نسبة أخرى')}</Text>
              </TouchableOpacity>
            </View>

            {customMode && (
              <TextInput
                style={styles.customInput}
                placeholder="0-100"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                value={customPct}
                onChangeText={v => {
                  const digits = toLatinDigits(v).replace(/[^0-9]/g, '').slice(0, 3);
                  setCustomPct(parseInt(digits, 10) > 100 ? '100' : digits);
                }}
                autoFocus
              />
            )}

            <Text style={styles.label}>{t('سبب الخصم (اختياري)')}</Text>
            <TextInput
              style={styles.reasonInput}
              placeholder={t('مثال: عميل دائم، طلب فيه نقص...')}
              placeholderTextColor={colors.muted}
              value={reason}
              onChangeText={setReason}
            />

            <TouchableOpacity onPress={confirm} activeOpacity={0.85} disabled={effectivePct <= 0}>
              <View style={[styles.confirm, effectivePct <= 0 && styles.confirmDisabled]}>
                {effectivePct > 0 && <GradientFill gradient={gradients.payButton} radius={radii.md} />}
                <Text style={[styles.confirmText, effectivePct <= 0 && styles.confirmTextDisabled]}>
                  {effectivePct > 0 ? `${t('تطبيق الخصم')} — ${effectivePct}٪` : t('اختر نسبة')}
                </Text>
              </View>
            </TouchableOpacity>

            {discountPct > 0 && (
              <TouchableOpacity onPress={clear} activeOpacity={0.8} style={styles.clearLink}>
                <Text style={styles.clearLinkText}>{t('إلغاء الخصم')}</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardLift>
    </Modal>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(6,16,10,0.78)', alignItems: 'center', justifyContent: 'center', padding: 16 },
    card: {
      width: 420,
      maxWidth: '92%',
      maxHeight: '88%',
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radii.xl,
      overflow: 'hidden',
    },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 20, paddingHorizontal: 22 },
    title: { fontFamily: fonts.sansBold, fontSize: 16.5, color: colors.text },
    headCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' },
    closeGlyph: { color: colors.text, fontSize: 13 },
    body: { paddingTop: 18, paddingHorizontal: 22, paddingBottom: 22 },

    // The fix: a wrapping grid of content-sized chips, not a `flex:1` row
    // with no bounded width to divide.
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing[4] },
    chip: {
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surf1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipActive: { backgroundColor: colors.lime, borderColor: colors.lime },
    chipText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text },
    chipTextActive: { color: colors.flagGreenDeep },

    customInput: {
      width: '100%',
      paddingVertical: 13,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surf1,
      color: colors.text,
      fontFamily: fonts.monoBold,
      fontSize: 16,
      textAlign: 'center',
      marginBottom: spacing[4],
    },

    label: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.muted, marginBottom: 6 },
    reasonInput: {
      width: '100%',
      paddingVertical: 13,
      paddingHorizontal: 14,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surf1,
      color: colors.text,
      fontFamily: fonts.sansSemiBold,
      fontSize: 13,
      textAlign: 'right',
      marginBottom: spacing[4],
    },

    confirm: { width: '100%', paddingVertical: 16, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.lime },
    confirmDisabled: { backgroundColor: colors.surf2 },
    confirmText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.flagGreenDeep },
    confirmTextDisabled: { color: colors.muted },
    clearLink: { alignSelf: 'center', marginTop: 14 },
    clearLinkText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.danger },
  }),
);
