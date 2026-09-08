import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { TouchableOpacity } from './tappable';
import { buildDeviceScenarios } from '../../../shared/receipt/scenarios';
import type { Scenario } from '../../../shared/receipt/scenarios';
import { BenchRow, runReceiptBench, renderScenarioPng } from '../application/receiptBench';
import { createStyles, fonts, radii, spacing } from './theme';

/**
 * إثباتُ الطباعة على الجهاز.
 *
 * الأرقامُ تُثبت أنّ الحسابَ واحد: المحرّكُ واحدٌ والبصماتُ متطابقة.
 * لكنّ الورقةَ فيها ما لا يُحسب -- خطُّ الأساس، وارتفاعُ السطر،
 * ومقاييسُ الخطّ، ووصلُ الحروف العربية، وسطرٌ فيه عربيٌّ وإنجليزيّ
 * معاً. تلك أشياءُ يقولها الشكلُ وحده.
 *
 * وWindows لا تشغّل Skia، فلا تُرى ورقةُ الأيباد إلّا من الأيباد. فهذه
 * الشاشةُ ترسم الحالاتِ المرجعيةَ بعينها التي يصوّرها الويبُ في CI،
 * وبأسمائها نفسِها -- فتُفتح صورةُ الويب بجانبها وتُقارن صورةٌ بصورة.
 *
 * وهي شاشةُ فحصٍ لا شاشةُ عمل: لا تطبع شيئاً، ولا تمسّ طلباً، ولا
 * تفتح درجاً. تبني الصورةَ وتعرضها.
 */
export default function ReceiptProofScreen({ onClose }: { onClose?: () => void }) {
  const styles = useStyles();
  const scenarios = React.useMemo(() => buildDeviceScenarios(), []);

  const [bench, setBench] = useState<BenchRow[] | null>(null);
  const [benchBusy, setBenchBusy] = useState(false);
  const [shots, setShots] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failed, setFailed] = useState<Record<string, string>>({});

  const measurePrinting = useCallback(async () => {
    setBenchBusy(true);
    try {
      setBench(await runReceiptBench());
    } catch (e) {
      setFailed(f => ({ ...f, __bench: String(e) }));
    } finally {
      setBenchBusy(false);
    }
  }, []);

  const draw = useCallback(async (s: Scenario) => {
    setBusyId(s.id);
    try {
      const out = await renderScenarioPng(s);
      if (out.png) setShots(p => ({ ...p, [s.id]: out.png as string }));
      else setFailed(f => ({ ...f, [s.id]: 'لم تُرمَّز الصورة' }));
    } catch (e) {
      setFailed(f => ({ ...f, [s.id]: String(e) }));
    } finally {
      setBusyId(null);
    }
  }, []);

  /** يرسم الحالاتِ كلَّها واحدةً بعد أخرى -- ثمّ تُمرَّر بالعين. */
  const drawAll = useCallback(async () => {
    for (const s of scenarios) {
      // واحدةً بعد أخرى قصداً: مئةُ سطحٍ معاً تحجز ذاكرةً لا داعيَ لها
      // على جهازٍ يعمل الوردية كلَّها.
      // eslint-disable-next-line no-await-in-loop
      await draw(s);
    }
  }, [draw, scenarios]);

  const shareBench = useCallback(() => {
    if (!bench) return;
    const lines = [
      'قياس الطباعة على الجهاز — ركين',
      'أصناف | تخطيط | سطح | رسم | ترميز | الكل | ارتفاع | ذاكرة',
      ...bench.map(r =>
        `${r.items} | ${r.layoutMs}ms | ${r.surfaceMs}ms | ${r.paintMs}ms | ${r.encodeMs}ms | ${r.totalMs}ms | ${r.height} | ${r.megabytes.toFixed(2)}MB`),
    ];
    Share.share({ message: lines.join('\n') }).catch(() => {
      // المشاركةُ رفاهية: الجدولُ معروضٌ على الشاشة على كلّ حال.
    });
  }, [bench]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>إثبات الطباعة</Text>
        {onClose ? (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeTxt}>إغلاق</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={styles.hint}>
        الورقةُ هنا مرسومةٌ بمحرّك الطباعة نفسِه الذي يرسم ورقةَ الويب،
        وبالحالات نفسِها وأسمائها. افتح صورةَ الويب المقابلة من
        tools/receipt-visual/baseline وقارِن.
      </Text>

      {/* ── القياس ── */}
      <Text style={styles.section}>قياس الطباعة</Text>
      <TouchableOpacity style={styles.btn} onPress={measurePrinting} disabled={benchBusy}>
        <Text style={styles.btnTxt}>{benchBusy ? 'يقيس…' : 'قِس ١ / ١٠ / ٣٠ / ١٠٠ صنف'}</Text>
      </TouchableOpacity>
      {bench ? (
        <View style={styles.table}>
          <View style={styles.tr}>
            {['أصناف', 'تخطيط', 'سطح', 'رسم', 'ترميز', 'الكل', 'ذاكرة'].map(h => (
              <Text key={h} style={[styles.td, styles.th]}>{h}</Text>
            ))}
          </View>
          {bench.map(r => (
            <View key={r.items} style={styles.tr}>
              <Text style={styles.td}>{r.items}</Text>
              <Text style={styles.td}>{r.layoutMs}</Text>
              <Text style={styles.td}>{r.surfaceMs}</Text>
              <Text style={styles.td}>{r.paintMs}</Text>
              <Text style={styles.td}>{r.encodeMs}</Text>
              <Text style={[styles.td, styles.tdStrong]}>{r.totalMs}</Text>
              <Text style={styles.td}>{r.megabytes.toFixed(1)}م</Text>
            </View>
          ))}
          <TouchableOpacity style={styles.linkBtn} onPress={shareBench}>
            <Text style={styles.linkTxt}>شارك الجدول</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {failed.__bench ? <Text style={styles.err}>{failed.__bench}</Text> : null}

      {/* ── المعاينة ── */}
      <Text style={styles.section}>الأوراق ({scenarios.length})</Text>
      <TouchableOpacity style={styles.btn} onPress={drawAll}>
        <Text style={styles.btnTxt}>ارسمها كلّها</Text>
      </TouchableOpacity>

      {scenarios.map(s => (
        <View key={s.id} style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.caseId}>{s.id}</Text>
            <TouchableOpacity style={styles.smallBtn} onPress={() => draw(s)} disabled={busyId === s.id}>
              <Text style={styles.smallBtnTxt}>{busyId === s.id ? '…' : 'ارسم'}</Text>
            </TouchableOpacity>
          </View>
          {busyId === s.id ? <ActivityIndicator /> : null}
          {failed[s.id] ? <Text style={styles.err}>{failed[s.id]}</Text> : null}
          {shots[s.id] ? (
            <Image
              // العرضُ بعرض الورق الحقيقيّ نسبةً، فما يُرى هو ما يُطبع.
              style={styles.paper}
              resizeMode="contain"
              source={{ uri: 'data:image/png;base64,' + shots[s.id] }}
            />
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.canvas },
    content: { padding: spacing[4], paddingBottom: spacing[6] * 2 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: 22, fontFamily: fonts.sansBold, color: colors.text },
    hint: { fontSize: 13, color: colors.muted, marginTop: spacing[2], lineHeight: 20 },
    section: { fontSize: 16, fontFamily: fonts.sansBold, color: colors.text, marginTop: spacing[4], marginBottom: spacing[2] },
    btn: { backgroundColor: colors.lime, borderRadius: radii.md, paddingVertical: spacing[3], alignItems: 'center' },
    btnTxt: { color: colors.graphite, fontFamily: fonts.sansBold, fontSize: 15 },
    smallBtn: { backgroundColor: colors.surf2, borderRadius: radii.sm, paddingHorizontal: spacing[3], paddingVertical: spacing[1] },
    smallBtnTxt: { color: colors.text, fontSize: 13 },
    closeBtn: { paddingHorizontal: spacing[3], paddingVertical: spacing[1] },
    closeTxt: { color: colors.accentText, fontSize: 15 },
    linkBtn: { alignSelf: 'flex-start', paddingVertical: spacing[2] },
    linkTxt: { color: colors.accentText, fontSize: 14 },
    table: { marginTop: spacing[3], backgroundColor: colors.cardBg, borderRadius: radii.md, padding: spacing[2] },
    tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
    td: { flex: 1, fontSize: 12, color: colors.text, textAlign: 'center' },
    th: { fontFamily: fonts.sansBold, color: colors.muted },
    tdStrong: { fontFamily: fonts.sansBold },
    card: { marginTop: spacing[3], backgroundColor: colors.cardBg, borderRadius: radii.md, padding: spacing[2] },
    caseId: { fontSize: 12, color: colors.muted },
    // الورقُ أبيضُ دائماً مهما كان وضعُ الشاشة: هي صورةُ ورقٍ لا عنصرُ واجهة.
    paper: { width: '100%', aspectRatio: 0.42, backgroundColor: '#ffffff', marginTop: spacing[2], borderRadius: radii.sm },
    err: { color: colors.danger, fontSize: 12, marginTop: spacing[1] },
  }),
);
