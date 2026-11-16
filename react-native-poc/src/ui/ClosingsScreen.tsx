import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { TouchableOpacity } from './tappable';
import { createStyles, fonts, radii, spacing, useTheme } from './theme';
import { getClosingReport, listClosingReports, type ClosingSummary } from '../application/shiftService';
import { enqueuePrintJob } from '../application/printService';
import { formatArabicDateTime } from '../domain/arabicDate';

/**
 * «الموازنات» -- كل وردية انقفلت بالفرع، الأحدث أول، وكل وحدة تنطبع من جديد.
 *
 * كان فيه زر «طباعة آخر موازنة» بس: موازنة أمس ضاعت لو انقفلت بعدها وردية.
 * الآن القائمة كاملة (آخر ٣٠)، وكل بطاقة تجاوب «وش صار بهالوردية؟» بنظرة:
 * عدد الطلبات، المبيعات، والفرق بالدرج بلونه.
 *
 * الويب: showClosingsScreen في public/pos/rakeen-pos.js -- نفس القائمة.
 */
export default function ClosingsScreen({
  branchId,
  businessName,
  branchName,
  onToast,
}: {
  branchId: number;
  businessName: string;
  branchName: string;
  onToast: (msg: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [rows, setRows] = useState<ClosingSummary[] | null>(null);
  const [error, setError] = useState('');
  const [printing, setPrinting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError('');
    setRows(null);
    try {
      setRows(await listClosingReports(branchId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّرت قراءة الموازنات');
      setRows([]);
    }
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const print = async (id: number) => {
    setPrinting(id);
    try {
      const report = await getClosingReport(id, businessName, branchName);
      if (!report) {
        onToast('ما لقيت هالموازنة — جرّب مرة ثانية');
        return;
      }
      await enqueuePrintJob('shiftReport', report as unknown as Record<string, unknown>);
      onToast('راحت الموازنة للطابعة');
    } catch {
      onToast('تعذّرت الطباعة — تحقق من الاتصال وجرّب مرة ثانية');
    } finally {
      setPrinting(null);
    }
  };

  if (rows == null) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.content}
      data={rows}
      keyExtractor={r => String(r.id)}
      ListHeaderComponent={
        <View style={styles.head}>
          <Text style={styles.title}>الموازنات</Text>
          <Text style={styles.sub}>كل وردية انقفلت بالفرع. اضغط «اطبعها» وتطلع الورقة نفسها.</Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{error ? 'ما قدرنا نجيب الموازنات' : 'ما فيه موازنات للحين'}</Text>
          <Text style={styles.emptySub}>
            {error || 'أول ما تقفل وردية، موازنتها تطلع هنا وتقدر تطبعها متى ما بغيت.'}
          </Text>
          {!!error && (
            <TouchableOpacity onPress={load} activeOpacity={0.8} style={styles.retry}>
              <Text style={styles.retryText}>جرّب مرة ثانية</Text>
            </TouchableOpacity>
          )}
        </View>
      }
      renderItem={({ item, index }) => {
        const v = Math.round(item.cashVariance * 100) / 100;
        const vColor = v === 0 ? colors.accentText : Math.abs(v) < 5 ? colors.amber : colors.danger;
        const vLabel = v === 0 ? 'الدرج مضبوط' : v > 0 ? `زيادة ${v.toFixed(2)}` : `نقص ${Math.abs(v).toFixed(2)}`;
        return (
          <View style={[styles.card, index === 0 && styles.cardLatest]}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardDate}>{formatArabicDateTime(new Date(item.createdAt))}</Text>
                {index === 0 && <Text style={styles.latestTag}>آخر موازنة</Text>}
              </View>
              <TouchableOpacity
                onPress={() => print(item.id)}
                disabled={printing != null}
                activeOpacity={0.85}
                style={[styles.printBtn, printing != null && printing !== item.id && styles.dim]}
                accessibilityRole="button"
                accessibilityLabel="اطبع الموازنة"
              >
                {printing === item.id ? (
                  <ActivityIndicator color={colors.text} size="small" />
                ) : (
                  <Text style={styles.printText}>اطبعها</Text>
                )}
              </TouchableOpacity>
            </View>
            <View style={styles.stats}>
              <Stat label="الطلبات" value={String(item.ordersCount)} />
              <Stat label="المبيعات" value={item.salesTotal.toFixed(2)} />
              <Stat label="بالدرج" value={item.cashCounted.toFixed(2)} />
            </View>
            <Text style={[styles.variance, { color: vColor }]}>{vLabel}</Text>
          </View>
        );
      }}
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    center: { alignItems: 'center', justifyContent: 'center' },
    content: { padding: spacing[4], paddingBottom: 32, gap: 12 },
    head: { marginBottom: 4 },
    title: { fontFamily: fonts.sansBold, fontSize: 22, color: colors.text },
    sub: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted, marginTop: 4 },
    card: {
      backgroundColor: colors.cardBg,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      padding: spacing[4],
      gap: 12,
    },
    cardLatest: { borderColor: colors.text },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    cardDate: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.text },
    latestTag: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.accentText, marginTop: 2 },
    printBtn: {
      minWidth: 84,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.lime,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    printText: { fontFamily: fonts.sansBold, fontSize: 14, color: '#101012' },
    dim: { opacity: 0.4 },
    stats: { flexDirection: 'row', gap: 8 },
    stat: { flex: 1, backgroundColor: colors.surf1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
    statValue: { fontFamily: fonts.monoBold, fontSize: 16, color: colors.text },
    statLabel: { fontFamily: fonts.sansMedium, fontSize: 11, color: colors.muted, marginTop: 2 },
    variance: { fontFamily: fonts.sansBold, fontSize: 13 },
    empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 8 },
    emptyTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text, textAlign: 'center' },
    emptySub: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted, textAlign: 'center' },
    retry: { marginTop: 8, paddingHorizontal: 18, height: 42, borderRadius: 12, backgroundColor: colors.lime, justifyContent: 'center' },
    retryText: { fontFamily: fonts.sansBold, fontSize: 14, color: '#101012' },
  }),
);
