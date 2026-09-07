import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { TouchableOpacity } from './tappable';
import {
  claimDisplay,
  getPosDeviceId,
  listBranchDisplays,
  type BranchDisplay,
} from '../application/displayScopeService';
import { createStyles, fonts, radii, useTheme } from './theme';

/**
 * أيُّ شاشةِ عميلٍ تقف أمام هذي النقطة.
 *
 * فرعٌ بثلاث نقاطِ بيعٍ وثلاثِ شاشات كان يبثّ الباركود إلى الثلاث معاً:
 * يرى ثلاثةُ زبائن باركوداً واحداً ولا يعرف أيُّهم صاحبُه -- ومن مسحه
 * من غير أصحابه أخذ بطاقتَه، فالرمزُ يُصرف مرّةً واحدة.
 *
 * والاختيارُ هنا لا في لوحة المالك: هو لا يعرف أيُّ شاشةٍ أمام أيِّ
 * نقطة، وغالباً ليس في المحلّ. والكاشير ينظر أمامه فيعرف.
 *
 * وبلا اختيارٍ تبقى الحال كما كانت -- البثُّ إلى شاشات الفرع غير
 * المربوطة -- فمقهىً بكاشيرٍ واحدٍ وشاشة لا يُسأل عن ربطٍ لا معنى له.
 *
 * (نظيرها في الويب: openMyDisplayModal.)
 */
export default function MyDisplayModal({
  visible,
  branchId,
  onClose,
  onToast,
}: {
  visible: boolean;
  branchId: number | null;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const styles = useStyles();
  const { shadows } = useTheme();
  const [rows, setRows] = useState<BranchDisplay[] | null>(null);
  const [mine, setMine] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setRows(null);
    (async () => {
      const [id, list] = await Promise.all([getPosDeviceId(), listBranchDisplays(branchId)]);
      if (!alive) return;
      setMine(id);
      setRows(list);
    })();
    return () => { alive = false; };
  }, [visible, branchId]);

  const pick = async (deviceId: number | null) => {
    if (busy) return;
    setBusy(true);
    const ok = await claimDisplay(deviceId);
    setBusy(false);
    if (!ok) { onToast('تعذر الربط'); return; }
    // والحالةُ تُحدَّث محلياً: الربطُ حصريّ، فما كان لي صار لا أحد.
    setRows(prev =>
      (prev || []).map(r => ({
        ...r,
        posDeviceId: r.id === deviceId ? mine : r.posDeviceId === mine ? null : r.posDeviceId,
      })),
    );
    onToast(deviceId == null ? 'انفكّ الربط' : 'تم الربط بهذي الشاشة');
  };

  const linkedId = (rows || []).find(r => r.posDeviceId === mine)?.id ?? null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, shadows.md]}>
          <View style={styles.head}>
            <Text style={styles.title}>شاشة العميل</Text>
            <TouchableOpacity onPress={onClose} style={styles.close} activeOpacity={0.8}>
              <Text style={styles.closeGlyph}>✕</Text>
            </TouchableOpacity>
          </View>

          {rows == null ? (
            <Text style={styles.note}>جارٍ التحميل...</Text>
          ) : rows.length === 0 ? (
            <Text style={styles.note}>ما فيه شاشة عميل لهذا الفرع — تنضاف من لوحة التحكم.</Text>
          ) : (
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
              <Text style={styles.hint}>اختر الشاشة اللي قدّام زبونك — الباركود يطلع عليها هي بس.</Text>
              {rows.map(r => {
                const isMine = !!r.posDeviceId && r.posDeviceId === mine;
                const takenByOther = !!r.posDeviceId && r.posDeviceId !== mine;
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={[styles.row, isMine && styles.rowOn]}
                    onPress={() => pick(r.id)}
                    activeOpacity={0.85}>
                    <Text style={styles.rowName}>{r.label || 'شاشة عميل'}</Text>
                    <Text style={[styles.rowState, isMine && styles.rowStateOn]}>
                      {isMine ? 'شاشتك' : takenByOther ? 'مربوطة بكاشير ثاني' : 'غير مربوطة'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[styles.row, linkedId == null && styles.rowOn]}
                onPress={() => pick(null)}
                activeOpacity={0.85}>
                <Text style={styles.rowName}>بلا ربط</Text>
                <Text style={[styles.rowState, linkedId == null && styles.rowStateOn]}>
                  يبث لكل شاشات الفرع غير المربوطة
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(6,16,10,0.78)',
      alignItems: 'center', justifyContent: 'center', padding: 18,
    },
    card: {
      width: 420, maxWidth: '94%', maxHeight: '86%',
      backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.line,
      borderRadius: radii.xl, overflow: 'hidden',
    },
    head: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 22, paddingTop: 20, paddingBottom: 4,
    },
    title: { fontFamily: fonts.sansBold, fontSize: 16.5, color: colors.text },
    close: {
      width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surf2,
      alignItems: 'center', justifyContent: 'center',
    },
    closeGlyph: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.text },
    body: { flexGrow: 0 },
    bodyContent: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 22, gap: 8 },
    hint: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted, lineHeight: 20, marginBottom: 4 },
    note: { paddingHorizontal: 22, paddingVertical: 26, textAlign: 'center', fontFamily: fonts.sansBold, fontSize: 13, color: colors.muted, lineHeight: 22 },
    row: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      paddingVertical: 14, paddingHorizontal: 15,
      borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.line,
      backgroundColor: colors.surf1,
    },
    rowOn: { borderColor: colors.limeDeep, backgroundColor: `rgba(${colors.limeRgb},0.13)` },
    rowName: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.text },
    rowState: { flexShrink: 1, textAlign: 'left', fontFamily: fonts.sansBold, fontSize: 11, color: colors.muted },
    rowStateOn: { color: colors.accentText },
  }),
);
