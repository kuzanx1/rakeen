import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { listPrintJobs, retryPrintJob, retryAllFailedPrintJobs } from '../application/printService';
import { PrintJobRecord, PrintJobStatus } from '../domain/printQueue';
import { createStyles, fonts, Palette, radii, spacing, useTheme } from './theme';

const STATUS_LABELS: Record<PrintJobStatus, string> = {
  queued: 'بانتظار الطباعة',
  printing: 'جارٍ الطباعة',
  printed: 'تمت الطباعة',
  skipped_no_printer: 'لا يوجد طابعة مُعدّة',
  retrying: 'إعادة محاولة قريبًا',
  failed: 'تعذرت الطباعة',
};

// No PWA equivalent exists for this screen at all -- it's a native-only
// capability (see the audit's gap table). Status colors reuse the same
// theme semantics as everywhere else (lime=success, amber=pending-retry,
// danger=failed, muted=neutral) rather than inventing new ones. Derived
// from the live palette rather than frozen at import, so it follows the
// light/dark toggle like everything else.
const statusColors = (colors: Palette): Record<PrintJobStatus, string> => ({
  queued: colors.muted,
  printing: colors.accentText,
  printed: colors.accentText,
  skipped_no_printer: colors.muted,
  retrying: colors.amber,
  failed: colors.danger,
});

/**
 * Checkpoint 10 (Print Queue) -- the real manual-retry surface the
 * checkpoint's own scope requires ("manual retry" is one of the
 * roadmap's explicit named capabilities for this checkpoint, unlike
 * Checkpoint 9 where a full status UI was correctly deferred to
 * Diagnostics/Checkpoint 13). Deliberately minimal -- a list + per-job
 * retry + "retry all failed", not a full Diagnostics screen.
 */
export default function PrintQueueScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const STATUS_COLORS = statusColors(colors);
  const [jobs, setJobs] = useState<PrintJobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const all = await listPrintJobs();
    setJobs([...all].sort((a, b) => b.created_at - a.created_at));
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000); // live-ish view while this screen is open
    return () => clearInterval(interval);
  }, [refresh]);

  const failedCount = jobs.filter(j => j.status === 'failed').length;

  const handleRetry = async (jobId: string) => {
    setBusy(true);
    try {
      await retryPrintJob(jobId);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleRetryAll = async () => {
    setBusy(true);
    try {
      await retryAllFailedPrintJobs();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accentText} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>قائمة الطباعة</Text>
        {failedCount > 0 && (
          <TouchableOpacity onPress={handleRetryAll} disabled={busy}>
            <Text style={styles.retryAllLink}>إعادة محاولة الكل ({failedCount})</Text>
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={jobs}
        keyExtractor={j => j.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>لا توجد مهام طباعة.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardTitle}>{item.type === 'kitchen' ? 'تذكرة مطبخ' : 'إيصال'}</Text>
              <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[item.status]}26` }]}>
                <Text style={[styles.statusBadgeText, { color: STATUS_COLORS[item.status] }]}>{STATUS_LABELS[item.status]}</Text>
              </View>
            </View>
            {!!item.last_error && <Text style={styles.errorText}>{item.last_error}</Text>}
            <Text style={styles.meta}>محاولات: {item.retry_count}</Text>
            {item.status === 'failed' && (
              <TouchableOpacity style={styles.retryButton} onPress={() => handleRetry(item.id)} disabled={busy} activeOpacity={0.8}>
                <Text style={styles.retryButtonText}>إعادة المحاولة</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />
    </View>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing[4],
    backgroundColor: colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: { fontFamily: fonts.sansBold, fontSize: 17, color: colors.text },
  retryAllLink: { fontFamily: fonts.sansBold, color: colors.accentText },
  list: { padding: spacing[4] },
  empty: { fontFamily: fonts.sansSemiBold, textAlign: 'center', color: colors.muted, padding: spacing[5] },
  card: {
    backgroundColor: colors.surf1,
    borderRadius: radii.lg,
    padding: spacing[3],
    marginBottom: spacing[2],
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.text },
  statusBadge: { borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontFamily: fonts.sansBold, fontSize: 11 },
  errorText: { fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.danger, marginBottom: 4 },
  meta: { fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.muted, marginBottom: spacing[2] },
  retryButton: { backgroundColor: colors.surf2, borderRadius: radii.sm, padding: spacing[2], alignItems: 'center' },
  retryButtonText: { fontFamily: fonts.sansBold, color: colors.text },
  }),
);
