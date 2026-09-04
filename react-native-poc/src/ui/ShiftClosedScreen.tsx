import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from './tappable';
import GradientFill from './GradientFill';
import Money from './Money';
import { listPrintJobs, retryPrintJob } from '../application/printService';
import { isPrintJobTerminal } from '../domain/printQueue';
import type { PrintJobStatus } from '../domain/printQueue';
import type { ClosingReport } from '../domain/shift';
import { createStyles, fonts, gradients, radii, useTheme } from './theme';

/**
 * The moment after a shift closes, and before the cashier is signed out.
 *
 * This step exists because of a real dead end: closing used to sign the
 * cashier out immediately. If the printer had jammed or run out of paper
 * at that exact moment, the balance slip was gone and the only way back to
 * it was to log in again, land on the open-shift screen, and go hunting
 * through المزيد. The one time a reprint is most likely to be needed was
 * the one time it was hardest to reach.
 *
 * So the print status is shown here, live, with a reprint button beside
 * it, and signing out is the cashier's own explicit last step.
 *
 * On the vocabulary, since it matters for whoever keeps the books:
 * the SHIFT is the period the drawer is open; the BALANCE is the document
 * that period produces when it closes. Closing a shift prints a balance --
 * printing a balance never closes anything. "طباعة آخر موازنة" in المزيد
 * is a reprint of an already-closed shift and changes nothing.
 */
export default function ShiftClosedScreen({
  report,
  printJobId,
  onFinish,
}: {
  report: ClosingReport;
  printJobId: string | null;
  onFinish: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [status, setStatus] = useState<PrintJobStatus | null>(printJobId ? 'queued' : null);
  const [jobId, setJobId] = useState(printJobId);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const job = (await listPrintJobs()).find(j => j.id === jobId);
        if (cancelled || !job) return;
        setStatus(job.status);
        if (isPrintJobTerminal(job.status)) clearInterval(id);
      } catch {
        // Keep the last known state; the shift is closed either way.
      }
    };
    const id = setInterval(tick, 700);
    tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [jobId]);

  const reprint = async () => {
    if (!jobId) return;
    try {
      await retryPrintJob(jobId);
      setStatus('queued');
    } catch {
      // retryPrintJob leaves the job where it was; the row keeps polling.
    }
  };

  const printed = status === 'printed' || status === 'skipped_no_printer';
  const failed = status === 'failed';

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.centerBox}>
        <View style={styles.card}>
          <Image
            source={require('../../assets/brand/rakeen-wordmark.png')}
            style={styles.wordmark}
            resizeMode="contain"
            accessibilityLabel="ركين"
          />
          <Text style={styles.title}>انقفلت الوردية</Text>
          <Text style={styles.sub}>{report.dateLabel}</Text>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>الكاش المتوقع</Text>
            <Money value={report.cashExpected} size={12} />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>المعدود فعليًا</Text>
            <Money value={report.cashCounted} size={12} />
          </View>
          <View style={[styles.row, styles.rowLast]}>
            <Text style={styles.rowLabelBold}>الفرق</Text>
            <Money
              value={report.cashVariance}
              size={15}
              color={report.cashVariance === 0 ? colors.accentText : colors.danger}
            />
          </View>

          {jobId != null && (
            <View style={styles.printRow}>
              {printed ? (
                <Text style={styles.printOk}>✓ تمت طباعة الموازنة</Text>
              ) : failed ? (
                <Text style={styles.printFail}>تعذرت الطباعة</Text>
              ) : (
                <>
                  <ActivityIndicator size="small" color={colors.accentText} />
                  <Text style={styles.printPending}>جاري طباعة الموازنة...</Text>
                </>
              )}
            </View>
          )}

          {/* Always offered, not only after a failure: the paper can run
              out or tear without the printer ever reporting an error. */}
          {jobId != null && (
            <TouchableOpacity onPress={reprint} style={styles.secondaryBtn} activeOpacity={0.8}>
              <Text style={styles.secondaryBtnText}>طباعة الموازنة مرة ثانية</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={onFinish} activeOpacity={0.85} style={styles.submitWrap}>
            <View style={styles.submit}>
              <GradientFill gradient={gradients.payButton} radius={radii.md} />
              <Text style={styles.submitText}>تسجيل الخروج</Text>
            </View>
          </TouchableOpacity>
          <Text style={styles.footNote}>
            تقدر تطبعها لاحقًا كمان من: المزيد ← طباعة آخر موازنة
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = createStyles((colors, shadows) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.canvas },
    centerBox: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.cardBg,
      borderRadius: 28,
      paddingTop: 36,
      paddingHorizontal: 30,
      paddingBottom: 30,
      alignItems: 'center',
      ...shadows.md,
    },
    wordmark: { height: 28, width: 65, marginBottom: 14 },
    title: { fontFamily: fonts.sansBold, fontSize: 21, color: colors.text, marginBottom: 4 },
    sub: { fontFamily: fonts.monoMedium, fontSize: 11.5, color: colors.muted, marginBottom: 18 },
    row: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 9,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    rowLast: { borderBottomWidth: 0 },
    rowLabel: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.muted },
    rowLabelBold: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text },
    printRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
    printPending: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text },
    printOk: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.accentText },
    printFail: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.danger },
    secondaryBtn: {
      width: '100%',
      paddingVertical: 13,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surf1,
      alignItems: 'center',
      marginTop: 14,
    },
    secondaryBtnText: { fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.text },
    submitWrap: { width: '100%', marginTop: 10 },
    submit: {
      width: '100%',
      paddingVertical: 16,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    submitText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.flagGreenDeep },
    footNote: { fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.muted, textAlign: 'center', marginTop: 12 },
  }),
);
