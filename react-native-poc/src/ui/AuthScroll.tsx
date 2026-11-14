import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, ScrollView, StyleProp, TextInput, ViewStyle, type ScrollViewInstance } from 'react-native';

/**
 * شاشات الدخول مع لوحة المفاتيح.
 *
 * على السنمي بالعرض تبقى ~٣٦٠ نقطة فوق اللوحة، والبطاقة كاملة (شعار +
 * عنوان + وصف + حقلين + زر) أطول من كذا: فكان الحقل أو زر «دخول» يندفن
 * تحت اللوحة. الحل جزءان، والاثنين لازمين:
 *
 * ١) useKeyboardOpen: الشاشة تعرف إن اللوحة مفتوحة فتصير «مدمجة» --
 *    يختفي الشعار والوصف الطويل وتصغر الحشوة، فيبقى العنوان والحقول
 *    والزر، وهذا يدخل فوق اللوحة في أصغر جهاز.
 * ٢) AuthScroll: بعد ما تفتح اللوحة يمرّر للحقل المركَّز عليه. أندرويد
 *    يمرّر عند التركيز -- قبل ما تفتح اللوحة وتصغر المساحة -- فيبقى
 *    الحقل تحتها. هنا نمرّر بعد فتحها.
 *
 * الرفع نفسه بالحشو (KeyboardAvoidingView padding) مثل KeyboardLift:
 * التطبيق مرسوم حافة لحافة فما يرفع adjustResize شيئاً.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', () => setOpen(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setOpen(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return open;
}

export default function AuthScroll({
  style,
  contentContainerStyle,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const ref = useRef<ScrollViewInstance>(null);
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      // بعد ما تنرسم الشاشة المدمجة والحشو.
      setTimeout(() => {
        const input = TextInput.State.currentlyFocusedInput?.();
        const inner = ref.current?.getInnerViewRef?.();
        if (!input || !inner) return;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (input as any).measureLayout(
            inner,
            (_x: number, y: number) => ref.current?.scrollTo({ y: Math.max(0, y - 96), animated: true }),
            () => {},
          );
        } catch {
          // المقاس ما توفّر: الشاشة المدمجة تكفي.
        }
      }, 80);
    });
    return () => sub.remove();
  }, []);
  return (
    <KeyboardAvoidingView style={style} behavior="padding">
      <ScrollView
        ref={ref}
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
