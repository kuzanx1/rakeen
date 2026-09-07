import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { TouchableOpacity } from './tappable';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
import { createStyles, fonts, radii, spacing, useTheme } from './theme';

/**
 * ماسحُ باركود بطاقة الولاء.
 *
 * الباب الثالث للتأكيد -- والوحيد الذي لا يشترط شبكةً عند العميل: بطاقتُه
 * في محفظته بلا اتصال، وباركودُها مرسومٌ فيها. ومسحُها إثباتُ حيازةٍ
 * أقوى من الرمز المنطوق: ذاك يُقال بالصوت ويُسمع، وهذا يُمسح من يده.
 *
 * وكان في الويب وحده -- التطبيق بلا ماسحٍ أصلاً، فزرُّه القديم أُزيل
 * لأنه كان يَعِد ولا يمسح. (نظيرها في الويب: openBarcodeScanner.)
 *
 * والباركود يحمل رابط البطاقة كاملاً، والرمزُ آخرُ مقطعٍ فيه -- كما
 * يقرؤه الويب حرفاً بحرف، فلا يفترق العميلان في قراءة الشيء نفسه.
 */
export default function CardScanner({
  visible,
  onScan,
  onCancel,
}: {
  visible: boolean;
  /** يُنادى برمز البطاقة (آخر مقطعٍ من الرابط) مرّةً واحدة. */
  onScan: (token: string) => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const device = useCameraDevice('back');
  const [granted, setGranted] = useState<boolean | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!visible) { setDone(false); return; }
    let alive = true;
    (async () => {
      const status = await Camera.requestCameraPermission();
      if (alive) setGranted(status === 'granted');
    })();
    return () => { alive = false; };
  }, [visible]);

  const handle = useCallback((value: string) => {
    // مرّةً واحدة: الماسح يقرأ عشرات الإطارات في الثانية، وكلُّها نفس
    // الرمز -- فبلا هذا يُرسَل التأكيد عشر مرّات.
    if (done) return;
    setDone(true);
    const token = value.split('/').filter(Boolean).pop() || '';
    onScan(token);
  }, [done, onScan]);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: codes => {
      const v = codes[0]?.value;
      if (v) handle(v);
    },
  });

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>امسح باركود بطاقته</Text>
        {granted === false ? (
          <Text style={styles.note}>ما أعطيتنا إذن الكاميرا — فعّله من إعدادات الجهاز.</Text>
        ) : !device ? (
          <Text style={styles.note}>ما لقينا كاميرا بهذا الجهاز — استخدم رقم البطاقة.</Text>
        ) : (
          <>
            <View style={styles.frame}>
              <Camera
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={visible && !done}
                codeScanner={codeScanner}
              />
            </View>
            <Text style={styles.note}>قرّب باركود البطاقة من الكاميرا</Text>
          </>
        )}
        <TouchableOpacity style={styles.cancel} onPress={onCancel}>
          <Text style={[styles.cancelText, { color: colors.muted }]}>إلغاء</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
    overlay: {
      // absoluteFillObject لا يوجد في أنواع RN 0.87 -- والقيم صريحةً
      // أوضح على كل حال.
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(6,16,10,0.86)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing[4],
    },
    card: {
      width: '92%',
      maxWidth: 420,
      backgroundColor: colors.cardBg,
      borderRadius: radii.xl,
      padding: spacing[4],
      alignItems: 'center',
    },
    title: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text, marginBottom: spacing[3] },
    // مربّعٌ لا مستطيل: الباركود مربّع، والإطار يقول أين يُوضع.
    frame: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: radii.md,
      overflow: 'hidden',
      backgroundColor: '#000',
    },
    note: { marginTop: spacing[3], textAlign: 'center', fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted, lineHeight: 20 },
    cancel: { marginTop: spacing[3], paddingVertical: 10, paddingHorizontal: 24 },
    cancelText: { fontFamily: fonts.sansBold, fontSize: 12.5 },
  }),
);
