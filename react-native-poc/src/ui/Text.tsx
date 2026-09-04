import React, { forwardRef } from 'react';
import {
  Text as RNText,
  TextInput as RNTextInput,
  TextInputProps,
  TextProps,
} from 'react-native';
import { useI18n } from './i18n';

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
  { children, ...rest },
  ref,
) {
  const { t } = useI18n();
  return (
    <RNText ref={ref} {...rest}>
      {translateChildren(children, t)}
    </RNText>
  );
});

function translateChildren(
  children: React.ReactNode,
  t: (ar: string) => string,
): React.ReactNode {
  if (typeof children === 'string') return translateOne(children, t);
  if (Array.isArray(children)) {
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
>(function TextInput({ placeholder, ...rest }, ref) {
  const { t } = useI18n();
  return (
    <RNTextInput
      ref={ref}
      placeholder={typeof placeholder === 'string' ? translateOne(placeholder, t) : placeholder}
      {...rest}
    />
  );
});
