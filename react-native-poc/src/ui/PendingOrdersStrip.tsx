import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { TouchableOpacity } from './tappable';
import { createStyles, fonts, radii } from './theme';
import Money from './Money';
import { listQueuedWithTime } from '../infrastructure/sqliteOrderQueue';
import { onOrderQueueChanged } from '../infrastructure/orderQueueEvents';
import { catalogItemName } from '../application/catalogService';
import { formatArabicTime } from '../domain/arabicDate';
import type { OrderPayload, QueuedPayload } from '../domain/order';
import { uiLang } from './i18n';

/**
 * «بانتظار الإرسال» -- الطلبات اللي انحفظت بهالجهاز وما وصلت الخادم بعد.
 *
 * كانت شاشة الطلبات تسأل الخادم وحده: بلا نت ما يطلع شي، والطلب اللي
 * انحفظ بلا نت مختفي لين يرتفع -- والزبون واقف بفاتورة «OF03» والكاشير
 * ما يلقاه. الحين يطلع هنا برقمه المؤقت وأصنافه، ولما يرتفع ينتقل
 * لقائمته ويطلع جنبه «كان OF03».
 *
 * بلا مؤقّت: يُقرأ عند الفتح وعند كل تغيّر في الطابور (orderQueueEvents).
 */

interface PendingRow {
  uuid: string;
  label: string;
  total: number;
  queuedAt: number;
  customer: string | null;
  items: { name: string; qty: number }[];
  stuck: boolean;
}

function toRow(p: QueuedPayload, queuedAt: number, branchId: number): PendingRow | null {
  if (p.type === 'dine_in_pay') return null; // دفع طلب موجود أصلاً
  const o = p as OrderPayload;
  if (o.branch_id != null && o.branch_id !== branchId) return null;
  const label = o.offline_ref
    ? o.offline_ref
    : o.reserved_order_no
      ? `#${o.reserved_order_no}`
      : o.reserved_order_id
        ? `#${o.reserved_order_id}`
        : '—';
  return {
    uuid: o.client_order_uuid,
    label,
    total: Number(o.total) || 0,
    queuedAt,
    customer: o.customer_name ?? null,
    items: (o.items || []).map(it => ({
      name: catalogItemName(it.menu_item_id, it.service_id)?.name ?? 'صنف',
      qty: Number(it.qty) || 1,
    })),
    stuck: !!o.stuck,
  };
}

export default function PendingOrdersStrip({ branchId }: { branchId: number }) {
  const styles = useStyles();
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [openUuid, setOpenUuid] = useState<string | null>(null);

  const read = useCallback(() => {
    listQueuedWithTime()
      .then(list => setRows(list.map(x => toRow(x.payload, x.queuedAt, branchId)).filter((r): r is PendingRow => r != null)))
      .catch(() => {});
  }, [branchId]);

  useEffect(() => {
    read();
    return onOrderQueueChanged(read);
  }, [read]);

  if (rows.length === 0) return null;
  return (
    <View style={styles.box}>
      <Text style={styles.title}>بانتظار الإرسال ({rows.length})</Text>
      <Text style={styles.hint}>انحفظت بهالجهاز وتنرسل لحالها أول ما يرجع النت — نادِ الزبون بالرقم اللي على فاتورته.</Text>
      {rows.map(r => {
        const open = openUuid === r.uuid;
        return (
          <View key={r.uuid} style={styles.row}>
            <TouchableOpacity style={styles.rowHead} onPress={() => setOpenUuid(open ? null : r.uuid)} activeOpacity={0.8}>
              <Text style={styles.ref}>{r.label}</Text>
              <View style={styles.meta}>
                <Text style={styles.metaText} numberOfLines={1}>
                  {formatArabicTime(new Date(r.queuedAt), uiLang())}
                  {r.customer ? ` · ${r.customer}` : ''}
                  {r.stuck ? ' · تعذّر الإرسال، يعيد المحاولة' : ''}
                </Text>
              </View>
              <Money value={r.total} size={14} />
              <Text style={styles.toggle}>{open ? 'إخفاء' : 'الأصناف'}</Text>
            </TouchableOpacity>
            {open && (
              <View style={styles.items}>
                {r.items.map((it, i) => (
                  <Text key={i} style={styles.item}>
                    {it.qty} × {it.name}
                  </Text>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
    box: {
      marginHorizontal: 16,
      marginTop: 10,
      padding: 12,
      borderRadius: radii.lg,
      borderWidth: 1.5,
      borderColor: colors.amber,
      backgroundColor: colors.cardBg,
      gap: 8,
    },
    title: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text },
    hint: { fontFamily: fonts.sansMedium, fontSize: 12.5, lineHeight: 19, color: colors.muted },
    row: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 },
    rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
    ref: { fontFamily: fonts.monoBold ?? fonts.sansBold, fontSize: 18, color: colors.text, minWidth: 56 },
    meta: { flex: 1 },
    metaText: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.muted },
    toggle: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.accentText, paddingHorizontal: 6 },
    items: { paddingTop: 6, paddingInlineStart: 66, gap: 3 },
    item: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: colors.text },
  }),
);
