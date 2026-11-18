import React, { createContext, forwardRef, useContext } from 'react';
import {
  StyleProp,
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  TextInputProps,
  TextProps,
  TextStyle,
} from 'react-native';
import { useI18n } from './i18n';
import { useTheme } from './theme';

/**
 * نص بدون fontSize ياخذ ١٤ الافتراضية من React Native -- وهذي ما تمر على
 * createStyles، فكانت تبقى ١٤ والشاشة مكبّرة (أزرار «اختبار الاتصال»
 * و«حفظ الإعدادات» طلعت صغيرة وسط صفحة كلها كبيرة). فالافتراضي هنا ١٤ ×
 * المقاس. والنص المتداخل ما ياخذه: يرث مقاس أبوه مثل ما كان.
 */
const DEFAULT_FONT_SIZE = 14;
const InsideText = createContext(false);

function withScaledDefault<S extends StyleProp<TextStyle>>(style: S, scale: number): S | (S | TextStyle)[] {
  if (scale === 1) return style;
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  if (flat && flat.fontSize != null) return style;
  return [{ fontSize: DEFAULT_FONT_SIZE * scale }, style];
}

/**
 * <Text> that translates its own content.
 *
 * The PWA solved this once already: rakeen-pos.js walks the DOM with a
 * TreeWalker and substitutes any text node whose whole value is a
 * dictionary key. That is why every screen there is English in English
 * mode, including screens nobody wrote translation calls for.
 *
 * The app had no equivalent. Translation happened only where somebody
 * remembered to write t(), which was 44 of 466 Arabic strings -- so the
 * home screen read English while everything behind "المزيد" stayed
 * Arabic. Wrapping the other 422 call sites by hand would fix today's
 * screens and re-break on the next one written; every new screen would
 * have to remember again.
 *
 * React Native has one chokepoint the DOM does not: all visible text goes
 * through <Text>. Translating here covers the screens that exist and the
 * ones not written yet, and it costs one import line per file.
 *
 * The PWA's two rules are kept exactly:
 *
 *  - WHOLE VALUE ONLY. A string is replaced only if the entire thing is a
 *    dictionary key. No substring substitution, so "قهوة" in the table
 *    never rewrites a product called "قهوة تركية".
 *  - PASS THROUGH ON MISS. Anything absent from the table renders as
 *    written, so prices, names, order numbers and customer notes are
 *    untouched.
 *
 * Receipts and kitchen tickets do NOT go through here -- they are built as
 * strings and rasterised, never mounted. The paper stays Arabic, which is
 * the behaviour a previous audit specifically asked for.
 */
export const Text = forwardRef<React.ComponentRef<typeof RNText>, TextProps>(function Text(
  { children, style, ...rest },
  ref,
) {
  const { t } = useI18n();
  const { scale } = useTheme();
  const nested = useContext(InsideText);
  const content = translateChildren(children, t);
  // الـProvider بس لو فيه نص متداخل فعلاً -- النص العادي يبقى أبناؤه
  // نفسهم (اختبارات تقرأ props.children مباشرة).
  const hasElement = React.Children.toArray(content).some(c => React.isValidElement(c));
  return (
    <RNText ref={ref} style={nested ? style : withScaledDefault(style, scale)} {...rest}>
      {hasElement ? <InsideText.Provider value>{content}</InsideText.Provider> : content}
    </RNText>
  );
});

function translateChildren(
  children: React.ReactNode,
  t: (ar: string) => string,
): React.ReactNode {
  if (typeof children === 'string') return translateOne(children, t);
  if (Array.isArray(children)) {
    // <Text>باقي {n} طلب</Text> reaches here as ['باقي ', 5, ' طلب'] --
    // pieces no table can hold. When every child is plain text or a
    // number, translate the sentence as one string (placeholder keys in
    // i18n.tsx) before falling back to piece by piece.
    if (children.length > 1 && children.every(c => typeof c === 'string' || typeof c === 'number')) {
      const whole = children.join('');
      const out = translateOne(whole, t);
      if (out !== whole) return out;
    }
    let changed = false;
    const next = children.map(child => {
      if (typeof child !== 'string') return child;
      const out = translateOne(child, t);
      if (out !== child) changed = true;
      return out;
    });
    // Returning the original array keeps the child elements referentially
    // identical, so a miss costs nothing in reconciliation.
    return changed ? next : children;
  }
  return children;
}

/**
 * Surrounding whitespace is preserved rather than being part of the key.
 * JSX writes `{'  '}` and newline-indented text as real spaces in the
 * child string, and a table keyed on trimmed Arabic should still match
 * those -- the alternative is entries that differ only in padding.
 */
function translateOne(value: string, t: (ar: string) => string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  const hit = t(trimmed);
  if (hit === trimmed) return value;
  const lead = value.slice(0, value.indexOf(trimmed[0]));
  return lead + hit + value.slice(lead.length + trimmed.length);
}

/**
 * <TextInput> whose placeholder translates.
 *
 * A placeholder is a prop, not a child, so the wrapper above never sees
 * it -- and six of the seven files with Arabic placeholders had no t() in
 * scope at all, several of them inside nested sub-components. Translating
 * at the same chokepoint keeps that from being a per-screen chore.
 *
 * The VALUE is deliberately untouched. It is what the cashier typed.
 */
export const TextInput = forwardRef<
  React.ComponentRef<typeof RNTextInput>,
  TextInputProps
>(function TextInput({ placeholder, style, ...rest }, ref) {
  const { t } = useI18n();
  const { scale } = useTheme();
  return (
    <RNTextInput
      ref={ref}
      placeholder={typeof placeholder === 'string' ? translateOne(placeholder, t) : placeholder}
      style={withScaledDefault(style, scale)}
      {...rest}
    />
  );
});
