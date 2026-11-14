import { useWindowDimensions } from 'react-native';
import { fonts } from './theme';

/**
 * شاشات الدخول v2 -- نفس مقاسات "Auth screens v2" في
 * app/pos/rakeen-pos-additions.css: تجهيز الجهاز، رمز الفرع، مين المداوم،
 * بدء الوردية. أيّ تعديل هنا يُنقل هناك، والعكس.
 *
 * كانت بطاقة ٣٦٠ وأزرار ٥٣ نقطة على تابلت ١٠ إنش: الإصبع أكبر من الزر.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function authBaseStyles(colors: any, shadows: any) {
  return {
    screen: { flex: 1, backgroundColor: colors.canvas },
    centerBox: { flexGrow: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 24 },
    /** لوحة المفاتيح مفتوحة (AuthScroll): من فوق، بحشوة أقل. */
    centerBoxKb: { justifyContent: 'flex-start' as const, paddingVertical: 10 },
    cardKb: { paddingTop: 20, paddingBottom: 18 },
    titleKb: { fontSize: 21, lineHeight: 28, marginBottom: 14 },
    card: {
      width: 440,
      maxWidth: '100%' as const,
      alignItems: 'center' as const,
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 32,
      paddingTop: 44,
      paddingHorizontal: 40,
      paddingBottom: 34,
      ...shadows.panel,
    },
    wordmark: { height: 34, width: 79, marginBottom: 22 },
    title: { fontFamily: fonts.sansBold, fontSize: 25, lineHeight: 33, color: colors.text, marginBottom: 8, textAlign: 'center' as const },
    sub: { fontFamily: fonts.sansMedium, fontSize: 14.5, lineHeight: 25, color: colors.muted, marginBottom: 26, textAlign: 'center' as const },
    field: { width: '100%' as const, marginBottom: 12 },
    label: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text, marginBottom: 8 },
    input: {
      width: '100%' as const,
      height: 56,
      paddingHorizontal: 18,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: colors.line,
      backgroundColor: colors.surf1,
      color: colors.text,
      fontFamily: fonts.sansSemiBold,
      fontSize: 16,
      textAlign: 'right' as const,
    },
    error: { fontFamily: fonts.sansBold, color: colors.danger, fontSize: 13.5, lineHeight: 21, marginBottom: 12, textAlign: 'center' as const },
    submitWrap: { width: '100%' as const, marginTop: 8 },
    submit: {
      width: '100%' as const,
      height: 58,
      borderRadius: 17,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      overflow: 'hidden' as const,
      backgroundColor: colors.lime, // تحت التدرّج: لو ما ترسم يبقى الزر ظاهر (GradientFill)
    },
    submitBusy: { backgroundColor: colors.surf2 },
    submitText: { fontFamily: fonts.sansBold, fontSize: 16.5, color: colors.flagGreenDeep },
  };
}

/**
 * مقاس زر لوحة الأرقام وحشوة البطاقة حسب الشاشة -- مثل @media في الويب.
 * السنمي بالعرض ~٧٢٠ نقطة طولاً: لوحة ٨٤ لا تدخل، فتصغر لـ٦٤.
 */
export function useAuthFit() {
  const { width, height } = useWindowDimensions();
  const short = height < 780;
  const narrow = width < 560;
  const key = short ? 64 : narrow ? 76 : 84;
  return {
    key,
    keyFont: short ? 24 : narrow ? 26 : 28,
    rowGap: short ? 10 : 16,
    colGap: short ? 18 : narrow ? 20 : 22,
    card: short
      ? { paddingTop: 26, paddingBottom: 20 }
      : narrow
        ? { width: '100%' as const, paddingTop: 34, paddingHorizontal: 22, paddingBottom: 26, borderRadius: 28 }
        : null,
    wordmark: short ? { marginBottom: 12 } : null,
    sub: short ? { marginBottom: 14 } : null,
    dots: short ? { marginBottom: 16 } : null,
  };
}
