import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './Text';
import { TouchableOpacity } from './tappable';
import GradientFill from './GradientFill';
import { createStyles, fonts, gradients, radii, spacing, useTheme } from './theme';
import { toLatinDigits } from '../domain/digits';
import KeyboardLift from './KeyboardLift';
import { recordWaste, listStockItems, WASTE_REASONS } from '../application/wasteService';
import type { StockPick } from '../application/wasteService';

/**
 * تسجيل الهدر من شاشة الكاشير.
 *
 * ثلاث خطوات على شاشة واحدة: أي مادة، كم، ولماذا. ولا شيء رابع --
 * الباريستا يسجّلها وسط الزحمة أو لا يسجّلها أبدًا.
 *
 * (نظيرها في اللوحة: زر «هدر» داخل بطاقة صنف المخزون.)
 */
export default function WasteModal({
  visible,
  onClose,
  onRecorded,
}: {
  visible: boolean;
  onClose: () => void;
  onRecorded: (message: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [search, setSearch] = useState('');
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stock, setStock] = useState<StockPick[]>([]);

  useEffect(() => {
    if (!visible) return;
    setSearch(''); setPickedId(null); setQty(''); setReason(''); setOther('');
    setBusy(false); setError('');
    listStockItems().then(setStock).catch(() => setStock([]));
  }, [visible]);

  const items = useMemo(() => {
    const q = search.trim();
    return (q ? stock.filter(i => i.name.includes(q)) : stock).slice(0, 40);
  }, [stock, search]);

  const picked = pickedId != null ? stock.find(i => i.id === pickedId) ?? null : null;
  const unit = picked ? picked.unit : '';
  const unitLabel = UNIT_LABELS[unit] || unit || '';
  const qtyNum = parseFloat(toLatinDigits(qty)) || 0;
  const effectiveReason = reason === 'أخرى' ? other.trim() : reason;
  const canSave = !!picked && qtyNum > 0 && !!effectiveReason;

  const save = async () => {
    if (!picked || !canSave) return;
    setBusy(true); setError('');
    const out = await recordWaste(picked.id, qtyNum, effectiveReason, unit);
    setBusy(false);
    if (!out.ok) { setError(out.error || 'تعذّر تسجيل الهدر'); return; }
    onRecorded(`انسجّل الهدر — ${picked.name}${out.cost ? ` (${out.cost.toFixed(2)} ر.س)` : ''}`);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardLift style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.title}>تسجيل هدر</Text>
            <TouchableOpacity onPress={onClose} style={styles.headCircle}>
              <Text style={styles.closeGlyph}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {!picked ? (
              <>
                <Text style={styles.label}>أي مادة راحت؟</Text>
                <TextInput
                  style={styles.input}
                  placeholder="دوّر بالاسم..."
                  placeholderTextColor={colors.muted}
                  value={search}
                  onChangeText={setSearch}
                  autoFocus
                />
                {items.length === 0 ? (
                  <Text style={styles.empty}>ما فيه مادة بهذا الاسم.</Text>
                ) : (
                  items.map(i => (
                    <TouchableOpacity key={i.id} style={styles.pickRow} onPress={() => setPickedId(i.id)} activeOpacity={0.8}>
                      <Text style={styles.pickName}>{i.name}</Text>
                      <Text style={styles.pickUnit}>{UNIT_LABELS[i.unit] || ''}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.pickedChip} onPress={() => setPickedId(null)} activeOpacity={0.8}>
                  <Text style={styles.pickedChipText}>{picked.name}</Text>
                  <Text style={styles.pickedChipChange}>تغيير</Text>
                </TouchableOpacity>

                <Text style={styles.label}>كم راح؟</Text>
                <View style={styles.qtyRow}>
                  <TextInput
                    style={[styles.input, styles.qtyInput]}
                    placeholder="0"
                    placeholderTextColor={colors.muted}
                    keyboardType="decimal-pad"
                    value={qty}
                    onChangeText={t => setQty(toLatinDigits(t))}
                    autoFocus
                  />
                  <Text style={styles.unitSuffix}>{unitLabel}</Text>
                </View>

                <Text style={styles.label}>السبب</Text>
                <View style={styles.chips}>
                  {WASTE_REASONS.map(r => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.chip, reason === r && styles.chipOn]}
                      onPress={() => setReason(r)}
                      activeOpacity={0.8}>
                      <Text style={[styles.chipText, reason === r && styles.chipTextOn]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {reason === 'أخرى' && (
                  <TextInput
                    style={[styles.input, styles.otherInput]}
                    placeholder="اكتب السبب"
                    placeholderTextColor={colors.muted}
                    value={other}
                    onChangeText={setOther}
                  />
                )}

                {!!error && <Text style={styles.error}>{error}</Text>}

                {busy ? (
                  <View style={[styles.submit, styles.submitDisabled]}>
                    <ActivityIndicator color={colors.muted} />
                  </View>
                ) : canSave ? (
                  <TouchableOpacity onPress={save} activeOpacity={0.85}>
                    <View style={styles.submit}>
                      <GradientFill gradient={gradients.payButton} radius={radii.md} />
                      <Text style={styles.submitText}>تسجيل الهدر</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.submit, styles.submitDisabled]}>
                    <Text style={[styles.submitText, styles.submitTextDisabled]}>تسجيل الهدر</Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardLift>
    </Modal>
  );
}

const UNIT_LABELS: Record<string, string> = {
  kg: 'كجم', g: 'غرام', liter: 'لتر', ml: 'مل', piece: 'حبة',
};

const useStyles = createStyles(colors =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(6,16,10,0.78)', alignItems: 'center', justifyContent: 'center', padding: 16 },
    card: {
      width: 420, maxWidth: '92%', maxHeight: '88%',
      backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.line,
      borderRadius: radii.xl, overflow: 'hidden',
    },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 20, paddingHorizontal: 22 },
    title: { fontFamily: fonts.sansBold, fontSize: 16.5, color: colors.text },
    headCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' },
    closeGlyph: { color: colors.text, fontSize: 13 },
    body: { paddingTop: 18, paddingHorizontal: 22, paddingBottom: 22 },

    label: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.muted, marginBottom: 6, marginTop: 4 },
    input: {
      width: '100%', paddingVertical: 13, paddingHorizontal: 14,
      borderRadius: radii.md, borderWidth: 1, borderColor: colors.line,
      backgroundColor: colors.surf1, color: colors.text,
      fontFamily: fonts.sansSemiBold, fontSize: 13, textAlign: 'right', marginBottom: 12,
    },
    empty: { fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.muted, textAlign: 'center', paddingVertical: 18 },

    pickRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingVertical: 13, paddingHorizontal: 14, marginBottom: 6,
      borderRadius: radii.md, backgroundColor: colors.surf1, borderWidth: 1, borderColor: colors.line,
    },
    pickName: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text, flexShrink: 1 },
    pickUnit: { fontFamily: fonts.sansMedium, fontSize: 11, color: colors.muted },

    pickedChip: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingVertical: 12, paddingHorizontal: 14, marginBottom: 14,
      borderRadius: radii.md, backgroundColor: `rgba(${colors.limeRgb},0.13)`,
      borderWidth: 1, borderColor: colors.limeDeep,
    },
    pickedChipText: { fontFamily: fonts.sansBold, fontSize: 13.5, color: colors.text },
    pickedChipChange: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.accentText },

    qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    qtyInput: { flex: 1, textAlign: 'center', fontFamily: fonts.monoBold, fontSize: 16 },
    unitSuffix: { fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.muted, marginBottom: 12 },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
    chip: {
      paddingVertical: 9, paddingHorizontal: 14, borderRadius: radii.full,
      borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf1,
    },
    chipOn: { backgroundColor: colors.lime, borderColor: colors.lime },
    chipText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text },
    chipTextOn: { color: colors.flagGreenDeep },
    otherInput: { marginTop: 2 },

    error: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.danger, textAlign: 'center', marginBottom: 10 },
    submit: { width: '100%', paddingVertical: 16, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginTop: spacing[1] },
    submitDisabled: { backgroundColor: colors.surf2 },
    submitText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.flagGreenDeep },
    submitTextDisabled: { color: colors.muted },
  }),
);
