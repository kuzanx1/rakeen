import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { TouchableOpacity } from './tappable';
import { createStyles, fonts, radii } from './theme';
import { AvailableUpdate, checkForAppUpdate, dismissAppUpdate } from '../application/appUpdateService';

/**
 * شريط «فيه تحديث جديد» فوق شاشة البيع -- لنسخة الرابط المباشر بس.
 * يسأل عند الفتح وعند الرجوع للتطبيق، بلا مؤقّت (appUpdateService.ts).
 * شريط مو نافذة: ما يوقف البيع، وما ينفتح فوق نافذة ثانية.
 */
export default function UpdateBanner() {
  const styles = useStyles();
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);

  const check = useCallback(() => {
    checkForAppUpdate().then(setUpdate).catch(() => {});
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  if (!update) return null;
  return (
    <View style={styles.bar}>
      <View style={styles.textCol}>
        <Text style={styles.title}>فيه تحديث جديد لركين {update.versionName ? `(${update.versionName})` : ''}</Text>
        <Text style={styles.sub}>نزّله وركّبه فوق الحالي — بياناتك ما تنمسح.</Text>
      </View>
      <TouchableOpacity
        style={styles.later}
        onPress={() => {
          void dismissAppUpdate(update.versionCode);
          setUpdate(null);
        }}>
        <Text style={styles.laterText}>لاحقاً</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.go} onPress={() => Linking.openURL(update.url).catch(() => {})}>
        <Text style={styles.goText}>حدّث الحين</Text>
      </TouchableOpacity>
    </View>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 12,
      marginTop: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: radii.lg,
      borderWidth: 1.5,
      borderColor: colors.limeDeep,
      backgroundColor: colors.cardBg,
    },
    textCol: { flex: 1, gap: 2 },
    title: { fontFamily: fonts.sansBold, fontSize: 14.5, color: colors.text },
    sub: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.muted },
    later: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
    laterText: { fontFamily: fonts.sansBold, fontSize: 13.5, color: colors.muted },
    go: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 16,
      borderRadius: radii.md,
      backgroundColor: colors.lime,
    },
    goText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.graphite },
  }),
);
