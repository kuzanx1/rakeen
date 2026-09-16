import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './Text';
import { TouchableOpacity } from './tappable';
import GradientFill from './GradientFill';
import { createStyles, fonts, gradients, radii, spacing, useTheme } from './theme';
import { toLatinDigits } from '../domain/digits';
import KeyboardLift from './KeyboardLift';
import { useI18n } from './i18n';
import {
  recordWaste, recordProductWaste, listStockItems, loadWasteCatalog, WASTE_REASONS,
} from '../application/wasteService';
import type { StockPick, ProductPick, WasteOptionPick } from '../application/wasteService';

/**
 * تسجيل الهدر من شاشة الكاشير.
 *
 * ثلاث خطوات على شاشة واحدة: أي شيء راح، كم، ولماذا. ولا شيء رابع --
 * الباريستا يسجّلها وسط الزحمة أو لا يسجّلها أبدًا.
 *
 * ويقبل نوعين لأن الهدر نوعان: مادةٌ خام من الرفّ (كيس بنّ انسكب)،
 * ومنتجٌ تامّ (وجبة عامل، كوبٌ رُدّ، صنفٌ احترق). وأكثره في المطاعم
 * النوع الثاني -- والباريستا لا يعرف أن «وجبة الموظف» تعني ١٨٠غ دجاج
 * و٥٠غ أرزّ، يعرف أنها وجبة. فالخصم يُحسب في الخادم من الوصفة نفسها
 * التي يُحسب بها البيع.
 *
 * والخيارات المرتبطة بالمخزون تُعرض ليؤشَّر ما دخل منها فعلًا -- أو
 * تُترك، ويُقال في الرسالة أيهما وقع. وهذا درسُ الاسترجاع الذي أعاد
 * ٤٨ من ١٠٨: مصدرُ خصمٍ لا يُسأل عنه يُنسى بصمت.
 *
 * (نظيرها في اللوحة: زر «هدر» داخل بطاقة صنف المخزون.)
 */
export default function WasteModal({
  visible,
  businessId,
  onClose,
  onRecorded,
}: {
  visible: boolean;
  businessId: number | null;
  onClose: () => void;
  onRecorded: (message: string) => void;
}) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = useStyles();

  const [mode, setMode] = useState<'stock' | 'product'>('stock');
  const [search, setSearch] = useState('');
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stock, setStock] = useState<StockPick[]>([]);
  const [products, setProducts] = useState<ProductPick[]>([]);
  const [optionsByProduct, setOptionsByProduct] = useState<Record<number, WasteOptionPick[]>>({});
  const [pickedOptions, setPickedOptions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!visible) return;
    setMode('stock'); setSearch(''); setPickedId(null); setQty('');
    setReason(''); setOther(''); setBusy(false); setError(''); setPickedOptions({});
    listStockItems().then(setStock).catch(() => setStock([]));
    if (businessId != null) {
      loadWasteCatalog(businessId)
        .then(c => { setProducts(c.products); setOptionsByProduct(c.optionsByProduct); })
        .catch(() => { setProducts([]); setOptionsByProduct({}); });
    }
  }, [visible, businessId]);

  const switchMode = (m: 'stock' | 'product') => {
    setMode(m); setPickedId(null); setSearch(''); setPickedOptions({}); setError('');
  };

  const stockItems = useMemo(() => {
    const q = search.trim();
    return (q ? stock.filter(i => i.name.includes(q)) : stock).slice(0, 40);
  }, [stock, search]);

  const productItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? products.filter(p => p.name.toLowerCase().includes(q) || (p.nameEn || '').toLowerCase().includes(q))
      : products;
    return list.slice(0, 40);
  }, [products, search]);

  const pickedStock = mode === 'stock' && pickedId != null ? stock.find(i => i.id === pickedId) ?? null : null;
  const pickedProduct = mode === 'product' && pickedId != null ? products.find(p => p.id === pickedId) ?? null : null;
  const picked = pickedStock || pickedProduct;

  const productName = (p: ProductPick) => (lang === 'en' && p.nameEn ? p.nameEn : p.name);
  const pickedName = pickedStock ? pickedStock.name : pickedProduct ? productName(pickedProduct) : '';

  const availableOptions = pickedProduct ? optionsByProduct[pickedProduct.id] || [] : [];
  const unit = pickedStock ? pickedStock.unit : '';
  const unitLabel = pickedStock ? (UNIT_LABELS[unit] || unit || '') : t('حبة');

  const qtyNum = parseFloat(toLatinDigits(qty)) || 0;
  const effectiveReason = reason === 'أخرى' ? other.trim() : reason;
  const canSave = !!picked && qtyNum > 0 && !!effectiveReason;

  const save = async () => {
    if (!picked || !canSave) return;
    setBusy(true); setError('');

    if (pickedStock) {
      const out = await recordWaste(pickedStock.id, qtyNum, effectiveReason, unit);
      setBusy(false);
      if (!out.ok) { setError(out.error || t('تعذّر تسجيل الهدر')); return; }
      onRecorded(`${t('انسجّل الهدر')} — ${pickedName}${out.cost ? ` (${out.cost.toFixed(2)} ${t('ر.س')})` : ''}`);
      onClose();
      return;
    }

    const decrements = availableOptions
      .filter(o => pickedOptions[o.key])
      .map(o => ({ stock_item_id: o.stockItemId, qty: o.qty * qtyNum }));
    const out = await recordProductWaste(pickedProduct!.id, qtyNum, effectiveReason, decrements);
    setBusy(false);
    if (!out.ok) { setError(out.error || t('تعذّر تسجيل الهدر')); return; }
    // صفرُ خصمٍ ليس خطأ -- منتجٌ بلا وصفة يُسجَّل هدره ولا يُنقص منه شيء.
    // ويُقال ذلك بدل أن يظنّ الكاشير أن المخزون نقص.
    onRecorded(out.deductedFromStock
      ? `${t('انسجّل الهدر')} — ${pickedName}${out.cost ? ` (${out.cost.toFixed(2)} ${t('ر.س')})` : ''}`
      : `${t('انسجّل الهدر')} — ${pickedName} · ${t('ما فيه وصفة مربوطة، فما انخصم من المخزون')}`);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardLift style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.title}>{t('تسجيل هدر')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.headCircle}>
              <Text style={styles.closeGlyph}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {!picked ? (
              <>
                <View style={styles.modeRow}>
                  <TouchableOpacity
                    style={[styles.modeTab, mode === 'stock' && styles.modeTabOn]}
                    onPress={() => switchMode('stock')}
                    activeOpacity={0.85}>
                    <Text style={[styles.modeText, mode === 'stock' && styles.modeTextOn]}>{t('مادة من المخزون')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modeTab, mode === 'product' && styles.modeTabOn]}
                    onPress={() => switchMode('product')}
                    activeOpacity={0.85}>
                    <Text style={[styles.modeText, mode === 'product' && styles.modeTextOn]}>{t('منتج جاهز')}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.modeHint}>
                  {mode === 'stock'
                    ? t('كيس انسكب، مادة تلفت، شي راح من الرف.')
                    : t('وجبة عامل، كوب رجّعه الزبون، صنف احترق — ننقص مكوّناته من المخزون.')}
                </Text>

                <TextInput
                  style={styles.input}
                  placeholder={t('دوّر بالاسم...')}
                  placeholderTextColor={colors.muted}
                  value={search}
                  onChangeText={setSearch}
                  autoFocus
                />
                {mode === 'stock' ? (
                  stockItems.length === 0 ? (
                    <Text style={styles.empty}>{t('ما فيه مادة بهذا الاسم.')}</Text>
                  ) : (
                    stockItems.map(i => (
                      <TouchableOpacity key={i.id} style={styles.pickRow} onPress={() => setPickedId(i.id)} activeOpacity={0.8}>
                        <Text style={styles.pickName}>{i.name}</Text>
                        <Text style={styles.pickUnit}>{UNIT_LABELS[i.unit] || ''}</Text>
                      </TouchableOpacity>
                    ))
                  )
                ) : productItems.length === 0 ? (
                  <Text style={styles.empty}>{t('ما فيه منتج بهذا الاسم.')}</Text>
                ) : (
                  productItems.map(p => (
                    <TouchableOpacity key={p.id} style={styles.pickRow} onPress={() => setPickedId(p.id)} activeOpacity={0.8}>
                      <Text style={styles.pickName}>{productName(p)}</Text>
                      {!!(optionsByProduct[p.id] || []).length && (
                        <Text style={styles.pickUnit}>{t('له خيارات')}</Text>
                      )}
                    </TouchableOpacity>
                  ))
                )}
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.pickedChip} onPress={() => { setPickedId(null); setPickedOptions({}); }} activeOpacity={0.8}>
                  <Text style={styles.pickedChipText}>{pickedName}</Text>
                  <Text style={styles.pickedChipChange}>{t('تغيير')}</Text>
                </TouchableOpacity>

                <Text style={styles.label}>{t('كم راح؟')}</Text>
                <View style={styles.qtyRow}>
                  <TextInput
                    style={[styles.input, styles.qtyInput]}
                    placeholder="0"
                    placeholderTextColor={colors.muted}
                    keyboardType="decimal-pad"
                    value={qty}
                    onChangeText={t2 => setQty(toLatinDigits(t2))}
                    autoFocus
                  />
                  <Text style={styles.unitSuffix}>{unitLabel}</Text>
                </View>

                {/* الخيارات: تُؤشَّر أو تُترك، ولا تُخمَّن. */}
                {availableOptions.length > 0 && (
                  <>
                    <Text style={styles.label}>{t('الخيارات اللي دخلت فيه (اختياري)')}</Text>
                    <Text style={styles.optHint}>{t('أشّر اللي انحط فعلاً عشان ينخصم معه. تقدر تتخطاها.')}</Text>
                    {availableOptions.map(o => {
                      const on = !!pickedOptions[o.key];
                      return (
                        <TouchableOpacity
                          key={o.key}
                          style={[styles.optRow, on && styles.optRowOn]}
                          onPress={() => setPickedOptions(s => ({ ...s, [o.key]: !s[o.key] }))}
                          activeOpacity={0.8}>
                          <Text style={[styles.optBox, on && styles.optBoxOn]}>{on ? '✓' : ''}</Text>
                          <Text style={styles.optName}>{o.groupName} · {o.optionName}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}

                <Text style={styles.label}>{t('السبب')}</Text>
                <View style={styles.chips}>
                  {WASTE_REASONS.map(r => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.chip, reason === r && styles.chipOn]}
                      onPress={() => setReason(r)}
                      activeOpacity={0.8}>
                      <Text style={[styles.chipText, reason === r && styles.chipTextOn]}>{t(r)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {reason === 'أخرى' && (
                  <TextInput
                    style={[styles.input, styles.otherInput]}
                    placeholder={t('اكتب السبب')}
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
                      <Text style={styles.submitText}>{t('تسجيل الهدر')}</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.submit, styles.submitDisabled]}>
                    <Text style={[styles.submitText, styles.submitTextDisabled]}>{t('تسجيل الهدر')}</Text>
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

    modeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    modeTab: {
      flex: 1, paddingVertical: 11, borderRadius: radii.md, alignItems: 'center',
      borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf1,
    },
    modeTabOn: { backgroundColor: colors.lime, borderColor: colors.lime },
    modeText: { fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.text },
    modeTextOn: { color: colors.flagGreenDeep },
    modeHint: { fontFamily: fonts.sansMedium, fontSize: 11, color: colors.muted, marginBottom: 12, lineHeight: 17 },

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

    optHint: { fontFamily: fonts.sansMedium, fontSize: 10.5, color: colors.muted, marginBottom: 8, lineHeight: 16 },
    optRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 11, paddingHorizontal: 12, marginBottom: 6,
      borderRadius: radii.md, backgroundColor: colors.surf1, borderWidth: 1, borderColor: colors.line,
    },
    optRowOn: { borderColor: colors.limeDeep, backgroundColor: `rgba(${colors.limeRgb},0.10)` },
    optBox: {
      width: 20, height: 20, lineHeight: 20, textAlign: 'center', borderRadius: 5,
      borderWidth: 1, borderColor: colors.line, color: 'transparent',
      fontFamily: fonts.sansBold, fontSize: 12, overflow: 'hidden',
    },
    optBoxOn: { backgroundColor: colors.lime, borderColor: colors.lime, color: colors.flagGreenDeep },
    optName: { fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.text, flexShrink: 1 },

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
