/**
 * Checkpoint 7 (Dine-in / Tables) — pure logic ported from rakeen-pos.js's
 * table-lifecycle helpers (groupTablesForDisplay, routeTableTap,
 * elapsedMinutesLabel, turnTimerSeverityClass, TABLE_STATUS_LABELS).
 * Zero I/O — no `document`/`window`/`supabase` here, directly testable.
 *
 * 'occupied' is NOT a current status — it was retired by
 * 20260816110000_dine_in_order_lifecycle_and_waitlist.sql (every existing
 * row was migrated to 'awaiting_order'). 'reserved' is kept only because
 * the DB CHECK constraint still allows it for old rows; nothing in the
 * current app writes it, and this port doesn't build a UI action for it
 * beyond a disabled label (see routeTableTap's 'reserved_legacy' branch).
 */

export type TableStatus =
  | 'available'
  | 'awaiting_order'
  | 'serving'
  | 'awaiting_payment'
  | 'cleaning'
  | 'reserved';

export interface TableSection {
  id: number;
  name: string;
  sort_order: number;
}

export interface RestaurantTable {
  id: number;
  number: number;
  status: TableStatus;
  active_order_id: number | null;
  section_id: number | null;
  status_changed_at: string;
}

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  available: 'متاحة',
  awaiting_order: 'بانتظار الطلب',
  serving: 'قيد التقديم',
  awaiting_payment: 'بانتظار الدفع',
  cleaning: 'تنظيف',
  reserved: 'محجوزة',
};

export interface TableGroup {
  section: TableSection | null;
  tables: RestaurantTable[];
}

/** Ported from groupTablesForDisplay: grouped by section in sort_order,
 *  with a trailing ungrouped bucket for tables with no section_id — or one
 *  flat ungrouped list if the branch never created any sections at all. */
export function groupTablesForDisplay(tables: RestaurantTable[], sections: TableSection[]): TableGroup[] {
  const byNumber = (a: RestaurantTable, b: RestaurantTable) => a.number - b.number;

  if (sections.length === 0) {
    return [{ section: null, tables: [...tables].sort(byNumber) }];
  }

  const knownSectionIds = new Set(sections.map(s => s.id));
  const bySection = new Map<number, RestaurantTable[]>();
  const unsectioned: RestaurantTable[] = [];
  for (const t of tables) {
    // A table whose section_id doesn't match any currently-known section
    // (null, or a section deleted between the two separate table/section
    // fetches -- section_id's own FK is ON DELETE SET NULL, so this can
    // only happen from that narrow race, never from stale-but-persisted
    // data) falls into the same trailing bucket as a genuinely unsectioned
    // table, rather than silently vanishing from the grid.
    if (t.section_id == null || !knownSectionIds.has(t.section_id)) {
      unsectioned.push(t);
      continue;
    }
    const bucket = bySection.get(t.section_id) || [];
    bucket.push(t);
    bySection.set(t.section_id, bucket);
  }

  const groups: TableGroup[] = [...sections]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(section => ({ section, tables: (bySection.get(section.id) || []).sort(byNumber) }));

  if (unsectioned.length > 0) {
    groups.push({ section: null, tables: unsectioned.sort(byNumber) });
  }
  return groups;
}

/** Ported from elapsedMinutesLabel — "since Xm" badge, driven by the
 *  DB-trigger-maintained status_changed_at, not a client-side guess. */
export function elapsedMinutes(statusChangedAtIso: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(statusChangedAtIso).getTime()) / 60000));
}

export type TurnTimerSeverity = 'ok' | 'warn' | 'over';

/** Ported from turnTimerSeverityClass: amber at 1x the configured turn
 *  time, red at 1.5x. */
export function turnTimerSeverity(elapsedMins: number, turnTimeMinutes: number): TurnTimerSeverity {
  if (elapsedMins >= turnTimeMinutes * 1.5) return 'over';
  if (elapsedMins >= turnTimeMinutes) return 'warn';
  return 'ok';
}

/** Pure mapping of a tap on a table card to the action the UI should
 *  present — mirrors routeTableTap's per-status dispatch exactly, kept
 *  side-effect free so it's directly testable without any Supabase call. */
export type TableTapAction =
  | { kind: 'seat_walk_in' }
  | { kind: 'awaiting_order_sheet' }
  | { kind: 'serving_sheet' }
  | { kind: 'awaiting_payment_sheet' }
  | { kind: 'mark_cleaned' }
  | { kind: 'reserved_legacy' };

export function routeTableTap(status: TableStatus): TableTapAction {
  switch (status) {
    case 'available':
      return { kind: 'seat_walk_in' };
    case 'awaiting_order':
      return { kind: 'awaiting_order_sheet' };
    case 'serving':
      return { kind: 'serving_sheet' };
    case 'awaiting_payment':
      return { kind: 'awaiting_payment_sheet' };
    case 'cleaning':
      return { kind: 'mark_cleaned' };
    case 'reserved':
      return { kind: 'reserved_legacy' };
  }
}
