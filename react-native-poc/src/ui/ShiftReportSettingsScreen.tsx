import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text, TextInput } from './Text';
import { TouchableOpacity } from './tappable';
import { createStyles, fonts, radii, spacing, useTheme } from './theme';
import ManagerPinModal from './ManagerPinModal';
import { getShiftReportSettings, getShiftReportStockItems, saveShiftReportSettings } from '../application/catalogService';
import { listStockItems, type StockPick } from '../application/wasteService';
import { planHas } from '../application/planService';

/**
 * «إعدادات الموازنة» -- وش يطلع بورقة الموازنة، من الكاشير نفسه.
 *
 * كانت بلوحة التحكم بس. الآن صاحب المحل يختار من الجهاز: الخصومات،
 * المرتجعات، الضريبة، الأعداد، التوقيعات -- وأصناف من المخزون تنطبع «كم
 * انصرف منها بالوردية» (مثلاً البوكسات) عشان يطابقها باللي بالرف.
 *
 * الحفظ برمز المدير: pos_set_shift_report_settings يتحقق منه بالخادم.
 * الويب: showShiftReportSettings في public/pos/rakeen-pos.js.
 */
const OPTIONS: { key: string; title: string; hint: string }[] = [
  { key: 'discounts', title: 'الخصومات', hint: 'كم انخصم وتفصيل كل خصم' },
  { key: 'refunds', title: 'المرتجعات', hint: 'المبالغ اللي رجعت للزبائن' },
  { key: 'vat', title: 'الضريبة', hint: 'ضريبة القيمة المضافة' },
  { key: 'counts', title: 'عدد الطلبات والمتوسط', hint: 'كم طلب ومتوسط الفاتورة' },
  { key: 'signatures', title: 'خانات التوقيع', hint: 'توقيع الكاشير والمدير آخر الورقة' },
];
const MAX_ITEMS = 20;

export default function ShiftReportSettingsScreen({
  businessId,
  onToast,
  onDone,
}: {
  businessId: number;
  onToast: (msg: string) => void;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const hasStock = planHas('inventory');
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<Record<string, boolean>>({});
  const [picked, setPicked] = useState<number[]>([]);
  const [stock, setStock] = useState<StockPick[]>([]);
  const [query, setQuery] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const [s, ids, items] = await Promise.all([
        getShiftReportSettings(businessId),
        getShiftReportStockItems(businessId),
        hasStock ? listStockItems().catch(() => []) : Promise.resolve([] as StockPick[]),
      ]);
      if (!alive) return;
      setOptions(s.options || {});
      setPicked(ids);
      setStock(items);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [businessId, hasStock]);

  const isOn = (k: string) => options[k] !== false;
  const toggle = (k: string) => setOptions(o => ({ ...o, [k]: !(o[k] !== false) }));
  const togglePick = (id: number) => {
    setError('');
    setPicked(p => {
      if (p.includes(id)) return p.filter(x => x !== id);
      if (p.length >= MAX_ITEMS) {
        setError(`أقصى شي ${MAX_ITEMS} صنف`);
        return p;
      }
      return [...p, id];
    });
  };

  const shown = useMemo(() => {
    const q = query.trim();
    const list = q ? stock.filter(s => s.name.includes(q) || (s.nameEn || '').toLowerCase().includes(q.toLowerCase())) : stock;
    // المختار أول: يشوف وش يطلع بالورقة بدون ما يدوّر.
    return [...list].sort((a, b) => Number(picked.includes(b.id)) - Number(picked.includes(a.id)));
  }, [stock, query, picked]);

  const save = async (pin: string) => {
    setPinOpen(false);
    setSaving(true);
    setError('');
    const opts: Record<string, boolean> = {};
    for (const o of OPTIONS) opts[o.key] = isOn(o.key);
    const res = await saveShiftReportSettings(pin, { ...options, ...opts }, picked);
    setSaving(false);
    if (res.ok) {
      onToast('انحفظت إعدادات الموازنة');
      onDone();
    } else {
      setError(res.error || 'تعذّر الحفظ');
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>إعدادات الموازنة</Text>
        <Text style={styles.sub}>اختر وش يطلع بورقة الموازنة لما تقفل الوردية.</Text>

        <Text style={styles.section}>بالورقة</Text>
        <View style={styles.card}>
          {OPTIONS.map((o, i) => (
            <TouchableOpacity
              key={o.key}
              onPress={() => toggle(o.key)}
              activeOpacity={0.8}
              style={[styles.optRow, i > 0 && styles.optRowLine]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.optTitle}>{o.title}</Text>
                <Text style={styles.optHint}>{o.hint}</Text>
              </View>
              <Switch
                value={isOn(o.key)}
                onValueChange={() => toggle(o.key)}
                trackColor={{ true: colors.lime, false: colors.surf2 }}
                thumbColor="#ffffff"
              />
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.section}>من المخزون</Text>
        {!hasStock ? (
          <View style={styles.card}>
            <Text style={styles.lockText}>تطلع بالورقة كم انصرف من أصناف المخزون (مثل البوكسات). متوفرة بباقة عماد 🔒</Text>
          </View>
        ) : stock.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.lockText}>ما فيه أصناف بالمخزون للحين. أضفها من لوحة التحكم ← المخزون، وبعدها اخترها هنا.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.hintLine}>
              {picked.length ? `مختار ${picked.length} — تطلع بالورقة «كم انصرف بالوردية»` : 'اختر الأصناف اللي تبي تعرف كم انصرف منها بالوردية'}
            </Text>
            {stock.length > 8 && (
              <TextInput
                style={styles.search}
                placeholder="دوّر صنف…"
                placeholderTextColor={colors.muted}
                value={query}
                onChangeText={setQuery}
              />
            )}
            <View style={styles.chips}>
              {shown.map(s => {
                const on = picked.includes(s.id);
                return (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => togglePick(s.id)}
                    activeOpacity={0.8}
                    style={[styles.chip, on && styles.chipOn]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{`${on ? '✓ ' : ''}${s.name}`}</Text>
                    {!!s.unit && <Text style={[styles.chipUnit, on && styles.chipTextOn]}>{s.unit}</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
        {!!error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={() => setPinOpen(true)}
          disabled={saving}
          activeOpacity={0.85}
          style={[styles.saveBtn, saving && styles.dim]}
        >
          {saving ? <ActivityIndicator color="#101012" /> : <Text style={styles.saveText}>احفظ برمز المدير</Text>}
        </TouchableOpacity>
      </View>

      <ManagerPinModal visible={pinOpen} onApprove={pin => void save(pin)} onCancel={() => setPinOpen(false)} />
    </View>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    center: { alignItems: 'center', justifyContent: 'center' },
    content: { padding: spacing[4], paddingBottom: 24 },
    title: { fontFamily: fonts.sansBold, fontSize: 22, color: colors.text },
    sub: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted, marginTop: 4 },
    section: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.muted, marginTop: 22, marginBottom: 10 },
    card: { backgroundColor: colors.cardBg, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing[4] },
    optRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
    optRowLine: { borderTopWidth: 1, borderTopColor: colors.line },
    optTitle: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text },
    optHint: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.muted, marginTop: 2 },
    lockText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted, paddingVertical: 16, lineHeight: 20 },
    hintLine: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.text, marginBottom: 10 },
    search: {
      height: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.cardBg,
      paddingHorizontal: 14,
      color: colors.text,
      fontFamily: fonts.sansMedium,
      marginBottom: 10,
      textAlign: 'right',
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 40,
      paddingHorizontal: 14,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.cardBg,
    },
    chipOn: { backgroundColor: colors.lime, borderColor: colors.lime },
    chipText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text },
    chipUnit: { fontFamily: fonts.sansMedium, fontSize: 11, color: colors.muted },
    chipTextOn: { color: '#101012' },
    error: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.danger, marginTop: 14, textAlign: 'center' },
    footer: { padding: spacing[4], borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
    saveBtn: { height: 52, borderRadius: 14, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
    saveText: { fontFamily: fonts.sansBold, fontSize: 16, color: '#101012' },
    dim: { opacity: 0.5 },
  }),
);
