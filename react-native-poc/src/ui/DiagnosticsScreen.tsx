import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getDiagnosticsSnapshot, retryStuckOrders, retryAllFailedPrintJobs, DiagnosticsSnapshot } from '../application/diagnosticsService';

const OK = '#8bc34a';
const BAD = '#c0392b';
const UNKNOWN = '#9e9e9e';

function triColor(v: boolean | null): string {
  return v === true ? OK : v === false ? BAD : UNKNOWN;
}

function triLabel(v: boolean | null, okText: string, badText: string, unknownText: string): string {
  return v === true ? okText : v === false ? badText : unknownText;
}

/**
 * Checkpoint 13 (Diagnostics, final checkpoint) -- ported from the real
 * PWA's renderDiagnosticsBody (public/pos/rakeen-pos.js). Five
 * dimensions shown as explicitly SEPARATE rows, never collapsed into
 * one "everything is fine" signal: Internet, Cloud (Supabase), Native
 * Printer Bridge, Printer target configuration, Cash Drawer Bridge --
 * plus the live queue/print-job counts and the same two real bulk
 * retry actions the source has (reusing Checkpoint 9/10's already-
 * verified retry mechanisms, not new logic).
 */
export default function DiagnosticsScreen() {
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionStatus, setActionStatus] = useState('');

  const refresh = useCallback(async () => {
    const s = await getDiagnosticsSnapshot();
    setSnapshot(s);
  }, []);

  useEffect(() => {
    refresh();
    // Auto-refreshes while this screen is open -- matches the PWA's own
    // refreshDiagnosticsIfOpen (re-renders when NETWORK_STATE changes
    // rather than showing stale state until a manual tap).
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleRetryFailedPrints = async () => {
    setBusy(true);
    try {
      const n = await retryAllFailedPrintJobs();
      setActionStatus(`أُعيدت جدولة ${n} طباعة`);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleRetryStuckOrders = async () => {
    setBusy(true);
    try {
      const n = await retryStuckOrders();
      setActionStatus(`أُعيدت جدولة ${n} طلب`);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!snapshot) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>تشخيص النظام</Text>
      <View
        style={[
          styles.diagnosisBanner,
          { backgroundColor: snapshot.diagnosis.bad ? '#fdecea' : '#eef7e6' },
        ]}>
        <Text style={[styles.diagnosisText, { color: snapshot.diagnosis.bad ? BAD : OK }]}>{snapshot.diagnosis.text}</Text>
      </View>

      <Section title="الاتصال">
        <Row label="الإنترنت" color={triColor(snapshot.internet)} value={triLabel(snapshot.internet, '🟢 متصل', '🔴 غير متصل', '⚪ غير معروف بعد')} />
        <Row
          label="السحابة (Supabase)"
          color={triColor(snapshot.cloud)}
          value={triLabel(snapshot.cloud, '🟢 تعمل', '🔴 تعذر الوصول', '⚪ لم تُختبر بعد')}
        />
        {!!snapshot.lastCloudError && <Text style={styles.errorDetail}>آخر خطأ سحابة: {snapshot.lastCloudError}</Text>}
        <Row label="آخر مزامنة ناجحة" color={UNKNOWN} value={snapshot.lastSuccessfulSyncAt ? new Date(snapshot.lastSuccessfulSyncAt).toLocaleTimeString() : '—'} />
      </Section>

      <Section title="الطابعة">
        <Row
          label="طابعة (جسر Native)"
          color={snapshot.printerBridgeAvailable ? OK : BAD}
          value={snapshot.printerBridgeAvailable ? '🟢 متاح' : '🔴 غير متاح على هذا الجهاز/البناء'}
        />
        <Row
          label="إعداد الطابعة"
          color={snapshot.printerConfigured ? OK : UNKNOWN}
          value={snapshot.printerConfigured ? snapshot.printerTargetLabel! : '⚪ غير معدّة (راجع إعدادات الطابعة)'}
        />
      </Section>

      <Section title="درج النقدية">
        <Row
          label="درج النقدية (جسر Native)"
          color={snapshot.cashDrawerBridgeAvailable ? OK : UNKNOWN}
          value={snapshot.cashDrawerBridgeAvailable ? '🟢 متاح' : '⚪ غير متاح على هذا الجهاز/البناء'}
        />
      </Section>

      <Section title="طلبات بانتظار المزامنة">
        <Row label="إجمالي الطلبات المحفوظة محليًا" color={snapshot.queuedOrdersCount === 0 ? OK : UNKNOWN} value={String(snapshot.queuedOrdersCount)} />
        <Row label="طلبات عالقة (تحتاج تدخّل)" color={snapshot.stuckOrdersCount === 0 ? OK : BAD} value={String(snapshot.stuckOrdersCount)} />
      </Section>

      <Section title="قائمة الطباعة">
        <Row label="قيد الانتظار/الإعادة/جارٍ الطباعة" color={UNKNOWN} value={String(snapshot.printQueueCounts.queued + snapshot.printQueueCounts.retrying + snapshot.printQueueCounts.printing)} />
        <Row label="طباعات فاشلة نهائيًا" color={snapshot.printQueueCounts.failed === 0 ? OK : BAD} value={String(snapshot.printQueueCounts.failed)} />
      </Section>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.refreshButton} onPress={refresh} disabled={busy}>
          <Text style={styles.refreshButtonText}>تحديث</Text>
        </TouchableOpacity>
        {snapshot.failedPrintCount > 0 && (
          <TouchableOpacity style={styles.retryButton} onPress={handleRetryFailedPrints} disabled={busy}>
            <Text style={styles.retryButtonText}>إعادة محاولة الطباعات الفاشلة ({snapshot.failedPrintCount})</Text>
          </TouchableOpacity>
        )}
        {snapshot.stuckOrdersCount > 0 && (
          <TouchableOpacity style={styles.retryButton} onPress={handleRetryStuckOrders} disabled={busy}>
            <Text style={styles.retryButtonText}>إعادة محاولة الطلبات العالقة ({snapshot.stuckOrdersCount})</Text>
          </TouchableOpacity>
        )}
      </View>
      {!!actionStatus && <Text style={styles.actionStatus}>{actionStatus}</Text>}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f2f5f0' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16 },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 10 },
  diagnosisBanner: { borderRadius: 10, padding: 12, marginBottom: 14 },
  diagnosisText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e0e0e0' },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginBottom: 8, color: '#333' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontSize: 12, color: '#555' },
  rowValue: { fontSize: 12, fontWeight: '700' },
  errorDetail: { fontSize: 10.5, color: BAD, marginTop: 2, marginBottom: 4 },
  actionsRow: { gap: 8, marginTop: 4, marginBottom: 12 },
  refreshButton: { backgroundColor: '#3f51b5', borderRadius: 10, padding: 12, alignItems: 'center' },
  refreshButtonText: { color: '#fff', fontWeight: '700' },
  retryButton: { backgroundColor: '#8bc34a', borderRadius: 10, padding: 12, alignItems: 'center' },
  retryButtonText: { fontWeight: '700', color: '#1a1a1a' },
  actionStatus: { textAlign: 'center', fontSize: 12, marginBottom: 20, color: '#333' },
});
