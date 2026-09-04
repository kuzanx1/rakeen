import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { TouchableOpacity } from './tappable';
import { getDiagnosticsSnapshot, retryStuckOrders, retryAllFailedPrintJobs, DiagnosticsSnapshot } from '../application/diagnosticsService';
import { createStyles, fonts, Palette, radii, spacing, useTheme } from './theme';

/** Status tri-color, derived from the live palette so it follows the
 *  light/dark toggle (accentText is --lime-deep in light, --lime in
 *  dark -- the same pair rakeen-pos.css states for every lime text). */
const triColors = (colors: Palette) => ({
  OK: colors.accentText,
  BAD: colors.danger,
  UNKNOWN: colors.muted,
});

function triColor(t: ReturnType<typeof triColors>, v: boolean | null): string {
  return v === true ? t.OK : v === false ? t.BAD : t.UNKNOWN;
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
 *
 * Visuals: no dedicated diagnostics CSS class exists in the PWA (this
 * body is plain rows of label+value) -- rows reuse .shift-stat-row's
 * label/mono-value/border-bottom language from rakeen-pos.css, and the
 * status tri-color scheme reuses the same lime/danger/muted tokens used
 * everywhere else instead of Material green/red/gray.
 */
export default function DiagnosticsScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const tri = triColors(colors);
  const { OK, BAD, UNKNOWN } = tri;
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
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accentText} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>حالة الجهاز</Text>
      <View
        style={[
          styles.diagnosisBanner,
          { backgroundColor: snapshot.diagnosis.bad ? `rgba(${colors.dangerRgb},0.14)` : `rgba(${colors.limeRgb},0.14)` },
        ]}>
        <Text style={[styles.diagnosisText, { color: snapshot.diagnosis.bad ? BAD : OK }]}>{snapshot.diagnosis.text}</Text>
      </View>

      <Section title="الاتصال">
        <Row label="الإنترنت" color={triColor(tri, snapshot.internet)} value={triLabel(snapshot.internet, '🟢 متصل', '🔴 غير متصل', '⚪ غير معروف بعد')} />
        <Row
          label="الاتصال بحساب المطعم"
          color={triColor(tri, snapshot.cloud)}
          value={triLabel(snapshot.cloud, '🟢 تعمل', '🔴 تعذر الوصول', '⚪ لم تُختبر بعد')}
        />
        {!!snapshot.lastCloudError && <Text style={styles.errorDetail}>آخر خطأ سحابة: {snapshot.lastCloudError}</Text>}
        <Row label="آخر تحديث ناجح" color={UNKNOWN} value={snapshot.lastSuccessfulSyncAt ? new Date(snapshot.lastSuccessfulSyncAt).toLocaleTimeString() : '—'} last />
      </Section>

      <Section title="الطابعة">
        <Row
          label="الطابعة"
          color={snapshot.printerBridgeAvailable ? OK : BAD}
          value={snapshot.printerBridgeAvailable ? '🟢 متاح' : '🔴 غير متاح على هذا الجهاز'}
        />
        <Row
          label="إعداد الطابعة"
          color={snapshot.printerConfigured ? OK : UNKNOWN}
          value={snapshot.printerConfigured ? snapshot.printerTargetLabel! : '⚪ غير معدّة (راجع إعدادات الطابعة)'}
          last
        />
      </Section>

      <Section title="درج النقدية">
        <Row
          label="درج النقدية"
          color={snapshot.cashDrawerBridgeAvailable ? OK : UNKNOWN}
          value={snapshot.cashDrawerBridgeAvailable ? '🟢 متاح' : '⚪ غير متاح على هذا الجهاز'}
          last
        />
      </Section>

      <Section title="طلبات بانتظار المزامنة">
        <Row label="الطلبات المحفوظة على الجهاز" color={snapshot.queuedOrdersCount === 0 ? OK : UNKNOWN} value={String(snapshot.queuedOrdersCount)} />
        <Row label="طلبات متعلّقة تحتاج مراجعة" color={snapshot.stuckOrdersCount === 0 ? OK : BAD} value={String(snapshot.stuckOrdersCount)} last />
      </Section>

      <Section title="قائمة الطباعة">
        <Row label="قيد الطباعة أو الانتظار" color={UNKNOWN} value={String(snapshot.printQueueCounts.queued + snapshot.printQueueCounts.retrying + snapshot.printQueueCounts.printing)} />
        <Row label="فواتير ما طبعت" color={snapshot.printQueueCounts.failed === 0 ? OK : BAD} value={String(snapshot.printQueueCounts.failed)} last />
      </Section>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.refreshButton} onPress={refresh} disabled={busy} activeOpacity={0.8}>
          <Text style={styles.refreshButtonText}>تحديث</Text>
        </TouchableOpacity>
        {snapshot.failedPrintCount > 0 && (
          <TouchableOpacity style={styles.retryButton} onPress={handleRetryFailedPrints} disabled={busy} activeOpacity={0.8}>
            <Text style={styles.retryButtonText}>إعادة محاولة الطباعات الفاشلة ({snapshot.failedPrintCount})</Text>
          </TouchableOpacity>
        )}
        {snapshot.stuckOrdersCount > 0 && (
          <TouchableOpacity style={styles.retryButton} onPress={handleRetryStuckOrders} disabled={busy} activeOpacity={0.8}>
            <Text style={styles.retryButtonText}>إعادة محاولة الطلبات العالقة ({snapshot.stuckOrdersCount})</Text>
          </TouchableOpacity>
        )}
      </View>
      {!!actionStatus && <Text style={styles.actionStatus}>{actionStatus}</Text>}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// .shift-stat-row (rakeen-pos.css:578-583)
function Row({ label, value, color, last }: { label: string; value: string; color: string; last?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color }]}>{value}</Text>
    </View>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: spacing[4] },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.text, marginBottom: spacing[2] },
  diagnosisBanner: { borderRadius: radii.md, padding: spacing[3], marginBottom: spacing[4] },
  diagnosisText: { fontFamily: fonts.sansBold, fontSize: 13, textAlign: 'center' },
  section: { backgroundColor: colors.cardBg, borderRadius: radii.lg, padding: spacing[4], marginBottom: spacing[3], borderWidth: 1, borderColor: colors.line },
  sectionTitle: { fontFamily: fonts.sansBold, fontSize: 13, marginBottom: spacing[2], color: colors.text },
  // .shift-stat-row
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.muted },
  // Mixed content (Arabic status text and plain numbers/timestamps) --
  // unlike a pure money/mono value, forcing writingDirection:'ltr' here
  // would break the Arabic strings, so it's left at the default.
  rowValue: { fontFamily: fonts.sansBold, fontSize: 12 },
  errorDetail: { fontFamily: fonts.sansSemiBold, fontSize: 10.5, color: colors.danger, marginTop: 2, marginBottom: 4 },
  actionsRow: { gap: spacing[2], marginTop: 4, marginBottom: spacing[3] },
  refreshButton: { backgroundColor: colors.surf1, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, padding: spacing[3], alignItems: 'center' },
  refreshButtonText: { fontFamily: fonts.sansBold, color: colors.text },
  retryButton: { backgroundColor: colors.surf2, borderRadius: radii.md, padding: spacing[3], alignItems: 'center' },
  retryButtonText: { fontFamily: fonts.sansBold, color: colors.text },
  actionStatus: { fontFamily: fonts.sansSemiBold, textAlign: 'center', fontSize: 12, marginBottom: spacing[5], color: colors.muted },
  }),
);
