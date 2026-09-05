import React from 'react';
import { KeyboardAvoidingView, Platform, StyleProp, ViewStyle } from 'react-native';

/**
 * يرفع محتوى النافذة فوق لوحة المفاتيح بدل أن تُدفن تحتها.
 *
 * لوحة الآيباد تأخذ نحو نصف الشاشة، والنوافذ هنا موسّطة رأسياً. فحين
 * يلمس الكاشير حقل المبلغ، تفتح اللوحة فوق النافذة نفسها -- فيختفي
 * الحقل وزر التأكيد معاً، ولا سبيل إلى إغلاقها إلا بتخمين مكان زر
 * الإلغاء. وهو ما بلّغ عنه الكاشير حرفياً: تختفي النافذة والزر.
 *
 * والعلاج طبقة واحدة مشتركة لا إصلاحٌ في كل نافذة: النوافذ ذات الحقول
 * كثيرة، ولو عولجت واحدةً واحدةً لعادت المشكلة مع أول نافذة جديدة
 * ينساها كاتبها.
 *
 * behavior على iOS يكون 'padding': النافذة موسّطة داخل حاوية تملأ
 * الشاشة، فزيادة حشوٍ سفلي بارتفاع اللوحة تدفع المحتوى لأعلى وتُبقيه
 * موسّطاً في ما بقي. و'height' على أندرويد لأن 'padding' هناك يصطدم
 * بـ adjustResize الذي يفعل الشيء نفسه مرتين.
 *
 * وهو <View> في كل شيء آخر: يأخذ نفس النمط، ويُوضع مكان طبقة النافذة
 * تماماً، فلا يتغيّر شكل شيء حين تكون اللوحة مغلقة.
 */
export default function KeyboardLift({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  return (
    <KeyboardAvoidingView style={style} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {children}
    </KeyboardAvoidingView>
  );
}
