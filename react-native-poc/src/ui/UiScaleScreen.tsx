import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from './Text';
import { TouchableOpacity } from './tappable';
import { createStyles, effectiveScale, fonts, Palette, radii, scaleStyleSheet, spacing, UI_SCALES, useTheme } from './theme';

/**
 * «حجم الواجهة» -- المزيد ← الطابعة والجهاز.
 *
 * للشاشات الكبيرة (R10a وأمثالها) اللي تطلع فيها المنتجات صغيرة. التكبير
 * كله في طبقة الأنماط (theme.ts scaleStyleSheet) -- ما نلمس كثافة أندرويد
 * أبداً، لأن تغييرها قتل اللمس على الجهاز الحقيقي مرتين (1.33 و1.37).
 *
 * المعاينة تحت ترسم نفس شكل مربع المنتج وسطر السلة وزر الدفع بالحجم
 * المختار قبل ما يتطبّق، فالكاشير يشوف النتيجة قبل ما تتغيّر الشاشة كلها.
 */
export default function UiScaleScreen({ onToast }: { onToast: (msg: string) => void }) {
  const { colors, autoScale, userScale, setScale } = useTheme();
  const styles = useStyles();
  const [picked, setPicked] = useState(userScale);
  const { height } = useWindowDimensions();
  // المعاينة بالمقاس اللي بيطلع فعلاً: التلقائي حق هذي الشاشة × الاختيار.
  const preview = useMemo(
    () => scaleStyleSheet(previewBase(colors), effectiveScale(autoScale, picked, height)),
    [colors, autoScale, picked, height],
  );
  const scale = userScale;

  const apply = (value: number) => {
    setScale(value);
    setPicked(value);
    onToast(value === 1 ? 'رجعت الواجهة للحجم التلقائي' : 'تم تغيير حجم الواجهة');
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>حجم الواجهة</Text>
      <Text style={styles.hint}>
        الواجهة تتظبط تلقائياً حسب شاشة الجهاز. لو تبيها أكبر أو أصغر اختر هنا -- يتحفظ لهذا الجهاز بس.
      </Text>

      <View style={styles.options}>
        {UI_SCALES.map(s => {
          const on = s.value === picked;
          return (
            <TouchableOpacity
              key={s.value}
              onPress={() => setPicked(s.value)}
              activeOpacity={0.85}
              style={[styles.option, on && styles.optionOn]}
            >
              <Text style={[styles.optionText, on && styles.optionTextOn]}>{s.label}</Text>
              <Text style={[styles.optionPct, on && styles.optionTextOn]}>{`${Math.round(effectiveScale(autoScale, s.value, height) * 100)}%`}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>معاينة</Text>
      <View style={styles.previewBox}>
        <View style={preview.tilesRow}>
          {[
            { name: 'لاتيه', price: '18.00' },
            { name: 'شاورما دجاج', price: '14.00' },
            { name: 'عصير برتقال', price: '12.00' },
          ].map(p => (
            <View key={p.name} style={preview.tile}>
              <View style={preview.tileIcon}>
                <View style={preview.priceChip}>
                  <Text style={preview.price}>{p.price}</Text>
                </View>
              </View>
              <Text style={preview.tileName} numberOfLines={2}>{p.name}</Text>
            </View>
          ))}
        </View>
        <View style={preview.cartLine}>
          <Text style={preview.cartQty}>2×</Text>
          <Text style={preview.cartName}>لاتيه</Text>
          <Text style={preview.cartPrice}>36.00</Text>
        </View>
        <View style={preview.payBtn}>
          <Text style={preview.payText}>ادفع</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => apply(picked)}
          activeOpacity={0.85}
          disabled={picked === scale}
          style={[styles.applyBtn, picked === scale && styles.btnOff]}
        >
          <Text style={styles.applyText}>{picked === scale ? 'هذا الحجم الحالي' : 'طبّق الحجم'}</Text>
        </TouchableOpacity>
        {scale !== 1 ? (
          <TouchableOpacity onPress={() => apply(1)} activeOpacity={0.85} style={styles.resetBtn}>
            <Text style={styles.resetText}>رجّعها للتلقائي</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </ScrollView>
  );
}

/** نفس مقاسات مربع المنتج في ProductsScreen.tsx (productCard) بالحجم العادي. */
const previewBase = (colors: Palette) =>
  StyleSheet.create({
    // تلتف على الجوال بدل ما تنقص من الجنب.
    tilesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    tile: {
      width: 128,
      backgroundColor: colors.cardBg,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.line,
      paddingTop: 10,
      paddingHorizontal: 10,
      paddingBottom: 12,
    },
    tileIcon: { width: '100%', height: 72, borderRadius: radii.md, marginBottom: 7, backgroundColor: colors.surf1 },
    priceChip: {
      position: 'absolute',
      bottom: 5,
      end: 5,
      backgroundColor: colors.priceChipBg,
      borderRadius: radii.full,
      paddingVertical: 2,
      paddingHorizontal: 6,
    },
    price: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.lime, writingDirection: 'ltr' },
    tileName: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text, lineHeight: 15.6, height: 31.2 },
    cartLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 14,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: radii.md,
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.line,
      maxWidth: 360,
    },
    cartQty: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.accentText },
    cartName: { flex: 1, fontFamily: fonts.sansBold, fontSize: 14, color: colors.text },
    cartPrice: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.text },
    payBtn: {
      marginTop: 12,
      height: 48,
      maxWidth: 360,
      borderRadius: radii.full,
      backgroundColor: colors.lime,
      alignItems: 'center',
      justifyContent: 'center',
    },
    payText: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.graphite },
  });

const useStyles = createStyles(colors =>
  StyleSheet.create({
    root: { flex: 1 },
    scroll: { padding: spacing[5], paddingBottom: 40 },
    title: { fontFamily: fonts.sansBold, fontSize: 20, color: colors.text },
    hint: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted, marginTop: 4 },
    options: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: spacing[4] },
    option: {
      minWidth: 110,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: colors.line,
      backgroundColor: colors.cardBg,
      alignItems: 'center',
    },
    optionOn: { borderColor: colors.limeDeep, backgroundColor: colors.lime },
    optionText: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text },
    optionPct: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.muted, marginTop: 2 },
    optionTextOn: { color: colors.graphite },
    label: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.muted, marginTop: spacing[5], marginBottom: 8 },
    previewBox: {
      padding: spacing[4],
      borderRadius: radii.lg,
      backgroundColor: colors.surf1,
      overflow: 'hidden',
    },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: spacing[5] },
    applyBtn: {
      paddingVertical: 14,
      paddingHorizontal: 28,
      borderRadius: radii.full,
      backgroundColor: colors.flagGreen,
    },
    btnOff: { opacity: 0.45 },
    applyText: { fontFamily: fonts.sansBold, fontSize: 15, color: '#fff' },
    resetBtn: {
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: radii.full,
      borderWidth: 1.5,
      borderColor: colors.line,
    },
    resetText: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text },
  }),
);
