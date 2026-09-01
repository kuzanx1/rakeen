import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { listPrintJobs, retryPrintJob, retryAllFailedPrintJobs } from '../application/printService';
import { PrintJobRecord, PrintJobStatus } from '../domain/printQueue';

const STATUS_LABELS: Record<PrintJobStatus, string> = {
  queued: 'بانتظار الطباعة',
  printing: 'جارٍ الطباعة',
  printed: 'تمت الطباعة',
  skipped_no_printer: 'لا يوجد طابعة مُعدّة',
  retrying: 'إعادة محاولة قريبًا',
  failed: 'تعذرت الطباعة',
};

const STATUS_COLORS: Record<PrintJobStatus, string> = {
  queued: '#9e9e9e',
  printing: '#3f51b5',
  printed: '#8bc34a',
  skipped_no_printer: '#9e9e9e',
  retrying: '#ffb300',
  failed: '#c0392b',
};

/**
 * Checkpoint 10 (Print Queue) -- the real manual-retry surface the
 * checkpoint's own scope requires ("manual retry" is one of the
 * roadmap's explicit named capabilities for this checkpoint, unlike
 * Checkpoint 9 where a full status UI was correctly deferred to
 * Diagnostics/Checkpoint 13). Deliberately minimal -- a list + per-job
 * retry + "retry all failed", not a full Diagnostics screen.
 */
export default function PrintQueueScreen() {
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
      <View style={styles.center}>
        <ActivityIndicator />
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
              <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] }]}>
                <Text style={styles.statusBadgeText}>{STATUS_LABELS[item.status]}</Text>
              </View>
            </View>
            {!!item.last_error && <Text style={styles.errorText}>{item.last_error}</Text>}
            <Text style={styles.meta}>محاولات: {item.retry_count}</Text>
            {item.status === 'failed' && (
              <TouchableOpacity style={styles.retryButton} onPress={() => handleRetry(item.id)} disabled={busy}>
                <Text style={styles.retryButtonText}>إعادة المحاولة</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f2f5f0' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: { fontSize: 17, fontWeight: '800' },
  retryAllLink: { color: '#3f51b5', fontWeight: '700' },
  list: { padding: 14 },
  empty: { textAlign: 'center', color: '#777', padding: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  errorText: { fontSize: 11, color: '#c0392b', marginBottom: 4 },
  meta: { fontSize: 11, color: '#777', marginBottom: 6 },
  retryButton: { backgroundColor: '#8bc34a', borderRadius: 8, padding: 10, alignItems: 'center' },
  retryButtonText: { fontWeight: '700', color: '#1a1a1a' },
});
