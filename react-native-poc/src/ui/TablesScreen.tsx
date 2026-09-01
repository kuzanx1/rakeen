import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

const STATUS_COLORS: Record<RestaurantTable['status'], string> = {
  available: '#8bc34a',
  awaiting_order: '#ffb300',
  serving: '#3f51b5',
  awaiting_payment: '#e64a19',
  cleaning: '#9e9e9e',
  reserved: '#795548',
};

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
 */
export default function TablesScreen({
  branchId,
  onBeginOrderForTable,
}: {
  branchId: number;
  onBeginOrderForTable: (table: SelectedTableContext) => void;
}) {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [sections, setSections] = useState<TableSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sheetTable, setSheetTable] = useState<RestaurantTable | null>(null);
  const [movePickerFor, setMovePickerFor] = useState<RestaurantTable | null>(null);
  const [cancelConfirmFor, setCancelConfirmFor] = useState<RestaurantTable | null>(null);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

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

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

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
            showToast(`خطأ: ${String(e)}`);
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
            showToast(`خطأ: ${String(e)}`);
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
      showToast(`خطأ: ${String(e)}`);
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
      showToast(`خطأ: ${String(e)}`);
    } finally {
      setBusy(false);
      closeSheet();
      onBeginOrderForTable({ id: table.id, number: table.number, activeOrderId: table.active_order_id });
    }
  };

  const handleCancelOrder = async (table: RestaurantTable, stillOccupied: boolean) => {
    if (table.active_order_id == null) return;
    setBusy(true);
    try {
      await cancelDineInOrder(table.active_order_id, stillOccupied);
      await refresh();
    } catch (e) {
      showToast(`تعذر الإلغاء: ${String(e)}`);
    } finally {
      setBusy(false);
      setCancelConfirmFor(null);
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
      showToast(`تعذر النقل: ${String(e)}`);
    } finally {
      setBusy(false);
      setMovePickerFor(null);
      closeSheet();
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
        <Text style={styles.title}>الطاولات</Text>
        <TouchableOpacity onPress={refresh} disabled={busy}>
          <Text style={styles.refreshLink}>تحديث</Text>
        </TouchableOpacity>
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!toast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
      <ScrollView contentContainerStyle={styles.scroll}>
        {groups.map((group, gi) => (
          <View key={group.section?.id ?? `unsectioned-${gi}`} style={styles.sectionBlock}>
            {group.section && <Text style={styles.sectionTitle}>{group.section.name}</Text>}
            <View style={styles.grid}>
              {group.tables.map(table => {
                const mins = elapsedMinutes(table.status_changed_at);
                return (
                  <TouchableOpacity
                    key={table.id}
                    style={[styles.card, { borderColor: STATUS_COLORS[table.status] }]}
                    onPress={() => handleTablePress(table)}
                    disabled={busy}>
                    <Text style={styles.cardNumber}>طاولة {table.number}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[table.status] }]}>
                      <Text style={styles.statusBadgeText}>{TABLE_STATUS_LABELS[table.status]}</Text>
                    </View>
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
              <Text style={styles.sheetNote}>
                لا يمكن التراجع عن هذا. لا يُطلب رمز مدير هنا حاليًا (فجوة معروفة — راجع تقرير المرحلة 7).
              </Text>
              <SheetButton label="إلغاء الطلب — الطاولة لا تزال مشغولة" danger onPress={() => handleCancelOrder(cancelConfirmFor, true)} />
              <SheetButton label="إلغاء الطلب — إفراغ الطاولة" danger onPress={() => handleCancelOrder(cancelConfirmFor, false)} />
              <SheetButton label="تراجع" muted onPress={() => setCancelConfirmFor(null)} />
            </View>
          </View>
        </Modal>
      )}
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
  return (
    <TouchableOpacity
      style={[styles.sheetButton, danger && styles.sheetButtonDanger, muted && styles.sheetButtonMuted]}
      onPress={onPress}>
      <Text style={[styles.sheetButtonText, danger && styles.sheetButtonTextDanger]}>{label}</Text>
    </TouchableOpacity>
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
  refreshLink: { color: '#3f51b5', fontWeight: '700' },
  error: { color: '#c0392b', textAlign: 'center', padding: 8 },
  toast: { backgroundColor: '#333', padding: 10, alignItems: 'center' },
  toastText: { color: '#fff', fontSize: 13 },
  scroll: { padding: 14 },
  sectionBlock: { marginBottom: 18 },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8, color: '#333' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    width: 110,
    padding: 10,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  cardNumber: { fontSize: 14, fontWeight: '800', marginBottom: 6 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4 },
  statusBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  elapsed: { fontSize: 10, color: '#777' },
  empty: { textAlign: 'center', color: '#777', padding: 20 },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  sheetTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  sheetNote: { fontSize: 12, color: '#777', marginBottom: 14, textAlign: 'center' },
  sheetButton: { backgroundColor: '#eef1ec', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 8 },
  sheetButtonDanger: { backgroundColor: '#fdecea' },
  sheetButtonMuted: { backgroundColor: '#f5f5f5', marginTop: 4 },
  sheetButtonText: { fontWeight: '700', color: '#333' },
  sheetButtonTextDanger: { color: '#c0392b' },
});
