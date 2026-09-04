import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { TouchableOpacity } from './tappable';
import {
  listTables,
  listTableSections,
  seatWalkIn,
  freeAwaitingOrderTable,
  markTableCleaned,
  resumePaymentForTable,
  moveTableOrder,
  cancelDineInOrder,
  subscribeToTableChanges,
} from '../application/tableService';
import {
  RestaurantTable,
  TableSection,
  TABLE_STATUS_LABELS,
  groupTablesForDisplay,
  routeTableTap,
  elapsedMinutes,
} from '../domain/tables';
import ManagerPinModal from './ManagerPinModal';
import { createStyles, fonts, Palette, radii, spacing, useTheme } from './theme';
import { useShell } from './shell';
import { useToast } from './Toast';

// .table-card.<status> (rakeen-pos.css:469-489) -- border/background/text
// triples, verbatim. `occupied`/`maintenance` in the CSS aren't reachable
// through this domain's actual status union, so only the 6 real ones.
// Built from the live palette so it follows the light/dark toggle: the
// serving row in particular is --lime-deep in light and --lime in dark,
// which is exactly what accentText encodes.
const statusStyle = (colors: Palette): Record<RestaurantTable['status'], { border: string; bg: string; text: string }> => ({
  available: { border: colors.line, bg: colors.surf1, text: colors.muted },
  awaiting_order: { border: colors.amber, bg: `rgba(${colors.amberRgb},0.08)`, text: colors.amber },
  serving: { border: colors.limeDeep, bg: `rgba(${colors.limeRgb},0.1)`, text: colors.accentText },
  awaiting_payment: { border: colors.danger, bg: `rgba(${colors.dangerRgb},0.09)`, text: colors.danger },
  cleaning: { border: colors.muted, bg: colors.surf2, text: colors.muted },
  reserved: { border: colors.amber, bg: `rgba(${colors.amberRgb},0.08)`, text: colors.amber },
});

export interface SelectedTableContext {
  id: number;
  number: number;
  activeOrderId: number | null;
}

/**
 * Checkpoint 7 (Dine-in / Tables) — real floor grid, grouped by
 * table_sections exactly like rakeen-pos.js's groupTablesForDisplay/
 * renderTables. The money-moving transitions (available/awaiting_order ->
 * serving on register, -> cleaning on pay) are NOT made here at all —
 * they already happen atomically inside register_dine_in_order/
 * pay_dine_in_order (Checkpoints 5/6, untouched). This screen only makes
 * the plain client-side transitions the PWA also makes directly (seat/
 * free/clean) and the two management RPCs (move/cancel), then hands off
 * to ProductsScreen (via onBeginOrderForTable) for anything involving the
 * cart/order/payment.
 *
 * Visuals: .table-card / .table-num / .table-status match rakeen-pos.css
 * value-for-value (see STATUS_STYLE above); the action sheet reuses the
 * same dark-canvas/card-bg/lime-cta language as every other screen since
 * no dedicated PWA class exists for it (the PWA's own table actions are a
 * simple browser confirm()/inline buttons, not a bottom sheet).
 */
export default function TablesScreen({
  branchId,
  onBeginOrderForTable,
}: {
  branchId: number;
  onBeginOrderForTable: (table: SelectedTableContext) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { sideBySide, insetTop, insetBottom } = useShell();
  // rakeen-pos.css:433/435 -- .screen-head clears the absolutely-positioned
  // topbar (--topbar-h + 20) and .tables-grid clears the bottom nav
  // (20 + 68). Both are zero below 761px, where the bars are in flow.
  const headInset = sideBySide ? { paddingTop: insetTop + 20 } : null;
  const gridInset = sideBySide ? { paddingBottom: 20 + insetBottom } : null;
  const STATUS_STYLE = statusStyle(colors);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [sections, setSections] = useState<TableSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sheetTable, setSheetTable] = useState<RestaurantTable | null>(null);
  const [movePickerFor, setMovePickerFor] = useState<RestaurantTable | null>(null);
  const [cancelConfirmFor, setCancelConfirmFor] = useState<RestaurantTable | null>(null);
  const [busy, setBusy] = useState(false);
  // Feature Parity Pass -- Refunds/Void/Cancellation. Voiding an unpaid
  // dine-in order writes off real money -- ported from the PWA's own
  // manager-PIN gate in front of the exact same cancel_dine_in_order RPC
  // call (confirmCancelOrder's own doc comment: "same convention as shift
  // close and refunds"). Holds the pending cancel action until the PIN is
  // approved; cancelling the PIN modal performs nothing.
  const [pendingCancel, setPendingCancel] = useState<{ table: RestaurantTable; stillOccupied: boolean } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([listTables(branchId), listTableSections(branchId)]);
      setTables(t);
      setSections(s);
      setError('');
    } catch (e) {
      setError('تعذر تحميل الطاولات — تحقق من الاتصال.');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    refresh();
    // Real-time sync (see tableService.ts's own doc comment on
    // subscribeToTableChanges): NOT confirmed to deliver events on a real
    // device from this environment -- pull-to-refresh-equivalent (the
    // manual "تحديث" button below) is the verified fallback path.
    const unsubscribe = subscribeToTableChanges(branchId, refresh);
    return unsubscribe;
  }, [branchId, refresh]);

  const groups = useMemo(() => groupTablesForDisplay(tables, sections), [tables, sections]);

  // The source's own floating toast, not a band inside the layout.
  const { showToast } = useToast();

  const handleTablePress = (table: RestaurantTable) => {
    const action = routeTableTap(table.status);
    switch (action.kind) {
      case 'seat_walk_in':
        (async () => {
          setBusy(true);
          try {
            const won = await seatWalkIn(table.id);
            if (!won) showToast('طاولة انشغلت للتو');
            await refresh();
          } catch (e) {
            showToast('خطأ — جرّب مرة ثانية');
          } finally {
            setBusy(false);
          }
        })();
        return;
      case 'mark_cleaned':
        (async () => {
          setBusy(true);
          try {
            const won = await markTableCleaned(table.id);
            if (!won) showToast('حالة الطاولة تغيّرت للتو');
            await refresh();
          } catch (e) {
            showToast('خطأ — جرّب مرة ثانية');
          } finally {
            setBusy(false);
          }
        })();
        return;
      case 'reserved_legacy':
        showToast('حالة قديمة — لا يوجد إجراء');
        return;
      default:
        setSheetTable(table);
    }
  };

  const closeSheet = () => setSheetTable(null);

  const handleFreeAwaitingOrder = async (table: RestaurantTable) => {
    setBusy(true);
    try {
      const won = await freeAwaitingOrderTable(table.id);
      if (!won) showToast('حالة الطاولة تغيّرت للتو');
      await refresh();
    } catch (e) {
      showToast('خطأ — جرّب مرة ثانية');
    } finally {
      setBusy(false);
      closeSheet();
    }
  };

  const handleBeginOrder = (table: RestaurantTable) => {
    closeSheet();
    onBeginOrderForTable({ id: table.id, number: table.number, activeOrderId: table.active_order_id });
  };

  const handleResumePayment = async (table: RestaurantTable) => {
    if (table.status !== 'serving' && table.status !== 'awaiting_payment') return;
    setBusy(true);
    try {
      await resumePaymentForTable(table.id, table.status);
      await refresh();
    } catch (e) {
      showToast('خطأ — جرّب مرة ثانية');
    } finally {
      setBusy(false);
      closeSheet();
      onBeginOrderForTable({ id: table.id, number: table.number, activeOrderId: table.active_order_id });
    }
  };

  /** Only requests manager approval -- the real RPC call happens in
   *  performCancelOrder, once ManagerPinModal's onApprove fires. */
  const handleCancelOrder = (table: RestaurantTable, stillOccupied: boolean) => {
    if (table.active_order_id == null) return;
    setCancelConfirmFor(null);
    setPendingCancel({ table, stillOccupied });
  };

  const performCancelOrder = async () => {
    if (!pendingCancel || pendingCancel.table.active_order_id == null) {
      setPendingCancel(null);
      return;
    }
    const { table, stillOccupied } = pendingCancel;
    setPendingCancel(null);
    setBusy(true);
    try {
      await cancelDineInOrder(table.active_order_id as number, stillOccupied);
      await refresh();
    } catch (e) {
      showToast('تعذر الإلغاء — جرّب مرة ثانية');
    } finally {
      setBusy(false);
      closeSheet();
    }
  };

  const handleMoveTable = async (fromTable: RestaurantTable, toTable: RestaurantTable) => {
    if (fromTable.active_order_id == null) return;
    setBusy(true);
    try {
      await moveTableOrder(fromTable.active_order_id, toTable.id);
      await refresh();
    } catch (e) {
      showToast('تعذر النقل — جرّب مرة ثانية');
    } finally {
      setBusy(false);
      setMovePickerFor(null);
      closeSheet();
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
      <View style={[styles.header, headInset]}>
        <Text style={styles.title}>الطاولات</Text>
        <TouchableOpacity onPress={refresh} disabled={busy}>
          <Text style={styles.refreshLink}>تحديث</Text>
        </TouchableOpacity>
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <ScrollView contentContainerStyle={[styles.scroll, gridInset]}>
        {groups.map((group, gi) => (
          <View key={group.section?.id ?? `unsectioned-${gi}`} style={styles.sectionBlock}>
            {group.section && <Text style={styles.sectionTitle}>{group.section.name}</Text>}
            <View style={styles.grid}>
              {group.tables.map(table => {
                const mins = elapsedMinutes(table.status_changed_at);
                const st = STATUS_STYLE[table.status];
                return (
                  <TouchableOpacity
                    key={table.id}
                    style={[styles.card, { borderColor: st.border, backgroundColor: st.bg }]}
                    onPress={() => handleTablePress(table)}
                    disabled={busy}
                    activeOpacity={0.8}>
                    <Text style={styles.cardNumber}>طاولة {table.number}</Text>
                    <Text style={[styles.statusText, { color: st.text }]}>{TABLE_STATUS_LABELS[table.status]}</Text>
                    <Text style={styles.elapsed}>منذ {mins} د</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
        {tables.length === 0 && !error && <Text style={styles.empty}>لا يوجد طاولات لهذا الفرع.</Text>}
      </ScrollView>

      {sheetTable && (
        <Modal visible transparent animationType="fade" onRequestClose={closeSheet}>
          <View style={styles.sheetOverlay}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>
                طاولة {sheetTable.number} — {TABLE_STATUS_LABELS[sheetTable.status]}
              </Text>

              {sheetTable.status === 'awaiting_order' && (
                <>
                  <SheetButton label="تسجيل الطلب" onPress={() => handleBeginOrder(sheetTable)} />
                  <SheetButton label="إفراغ الطاولة" onPress={() => handleFreeAwaitingOrder(sheetTable)} />
                </>
              )}

              {sheetTable.status === 'serving' && (
                <>
                  <SheetButton label="+ إضافة أصناف" onPress={() => handleBeginOrder(sheetTable)} />
                  <SheetButton label="الدفع" onPress={() => handleResumePayment(sheetTable)} />
                  <SheetButton
                    label="تغيير الطاولة"
                    onPress={() => {
                      closeSheet();
                      setMovePickerFor(sheetTable);
                    }}
                  />
                  <SheetButton
                    label="إلغاء الطلب"
                    danger
                    onPress={() => {
                      closeSheet();
                      setCancelConfirmFor(sheetTable);
                    }}
                  />
                </>
              )}

              {sheetTable.status === 'awaiting_payment' && (
                <>
                  <SheetButton label="متابعة الدفع" onPress={() => handleResumePayment(sheetTable)} />
                  <SheetButton
                    label="تغيير الطاولة"
                    onPress={() => {
                      closeSheet();
                      setMovePickerFor(sheetTable);
                    }}
                  />
                  <SheetButton
                    label="إلغاء الطلب"
                    danger
                    onPress={() => {
                      closeSheet();
                      setCancelConfirmFor(sheetTable);
                    }}
                  />
                </>
              )}

              <SheetButton label="إغلاق" muted onPress={closeSheet} />
            </View>
          </View>
        </Modal>
      )}

      {movePickerFor && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setMovePickerFor(null)}>
          <View style={styles.sheetOverlay}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>نقل طاولة {movePickerFor.number} إلى:</Text>
              {tables
                .filter(t => t.status === 'available' && t.id !== movePickerFor.id)
                .map(t => (
                  <SheetButton key={t.id} label={`طاولة ${t.number}`} onPress={() => handleMoveTable(movePickerFor, t)} />
                ))}
              {tables.filter(t => t.status === 'available' && t.id !== movePickerFor.id).length === 0 && (
                <Text style={styles.empty}>لا يوجد طاولات متاحة للنقل إليها.</Text>
              )}
              <SheetButton label="إغلاق" muted onPress={() => setMovePickerFor(null)} />
            </View>
          </View>
        </Modal>
      )}

      {cancelConfirmFor && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setCancelConfirmFor(null)}>
          <View style={styles.sheetOverlay}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>إلغاء طلب طاولة {cancelConfirmFor.number}؟</Text>
              <Text style={styles.sheetNote}>لا يمكن التراجع عن هذا. يتطلب موافقة المدير.</Text>
              <SheetButton label="إلغاء الطلب — الطاولة لا تزال مشغولة" danger onPress={() => handleCancelOrder(cancelConfirmFor, true)} />
              <SheetButton label="إلغاء الطلب — إفراغ الطاولة" danger onPress={() => handleCancelOrder(cancelConfirmFor, false)} />
              <SheetButton label="تراجع" muted onPress={() => setCancelConfirmFor(null)} />
            </View>
          </View>
        </Modal>
      )}

      <ManagerPinModal visible={pendingCancel != null} onApprove={performCancelOrder} onCancel={() => setPendingCancel(null)} />
    </View>
  );
}

function SheetButton({
  label,
  onPress,
  danger,
  muted,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  muted?: boolean;
}) {
  const styles = useStyles();
  return (
    <TouchableOpacity
      style={[styles.sheetButton, danger && styles.sheetButtonDanger, muted && styles.sheetButtonMuted]}
      onPress={onPress}
      activeOpacity={0.8}>
      <Text style={[styles.sheetButtonText, danger && styles.sheetButtonTextDanger, muted && styles.sheetButtonTextMuted]}>{label}</Text>
    </TouchableOpacity>
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
  refreshLink: { fontFamily: fonts.sansBold, color: colors.accentText },
  error: { fontFamily: fonts.sansBold, color: colors.danger, textAlign: 'center', padding: spacing[2] },
  scroll: { padding: spacing[4] },
  sectionBlock: { marginBottom: spacing[5] },
  sectionTitle: { fontFamily: fonts.sansBold, fontSize: 14, marginBottom: spacing[2], color: colors.muted },
  // .tables-grid (grid-template-columns:repeat(auto-fill,minmax(114px,1fr)))
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] },
  // .table-card
  card: {
    width: 114,
    minHeight: 100,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  // .table-num
  cardNumber: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.text },
  // .table-status
  statusText: { fontFamily: fonts.sansBold, fontSize: 10 },
  elapsed: { fontFamily: fonts.sansSemiBold, fontSize: 10, color: colors.muted },
  empty: { fontFamily: fonts.sansSemiBold, textAlign: 'center', color: colors.muted, padding: spacing[6] },
  // .modal-overlay
  sheetOverlay: { flex: 1, backgroundColor: colors.modalOverlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.cardBg, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing[5] },
  sheetTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text, marginBottom: 6, textAlign: 'center' },
  sheetNote: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.muted, marginBottom: 14, textAlign: 'center' },
  // .pos-staff-btn reused as the generic sheet-action-button look
  sheetButton: { backgroundColor: colors.surf1, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, padding: 14, alignItems: 'center', marginBottom: spacing[2] },
  sheetButtonDanger: { backgroundColor: `rgba(${colors.dangerRgb},0.12)`, borderColor: colors.danger },
  sheetButtonMuted: { backgroundColor: 'transparent', borderColor: 'transparent', marginTop: 4 },
  sheetButtonText: { fontFamily: fonts.sansBold, color: colors.text },
  sheetButtonTextDanger: { color: colors.danger },
  sheetButtonTextMuted: { color: colors.muted },
  }),
);
