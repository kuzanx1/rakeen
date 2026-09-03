import React, { useCallback } from 'react';
import {
  Pressable as RNPressable,
  PressableProps,
  TouchableOpacity as RNTouchableOpacity,
  TouchableOpacityProps,
} from 'react-native';
import { playTapSound } from '../application/soundService';

/**
 * Drop-in replacements for react-native's TouchableOpacity/Pressable that
 * play the POS tap tick, so importing them instead of the originals gives
 * the whole app the sound with no change at any call site.
 *
 * The PWA gets this from one capture-phase listener:
 *
 *   document.addEventListener('click', (e) => {
 *     const el = e.target.closest('button, .dorder-card, .order-row[data-order]');
 *     if (el && !el.disabled) playTapSound();
 *   }, true);
 *
 * React Native has no equivalent global touch hook. The closest literal
 * translation -- onStartShouldSetResponderCapture on a root View -- was
 * rejected deliberately: it fires on EVERY touch in the tree, including
 * scroll starts and taps on empty space, whereas the source's selector
 * fires only on real interactive elements. Wrapping the two touchable
 * components keeps that "interactive elements only" rule exactly, and
 * `disabled` needs no special handling because React Native already
 * withholds onPress from a disabled touchable, which is precisely what
 * the source's own `!el.disabled` check is for.
 */

export function TouchableOpacity(props: TouchableOpacityProps) {
  const { onPress, ...rest } = props;
  const handlePress = useCallback<NonNullable<TouchableOpacityProps['onPress']>>(
    event => {
      playTapSound();
      onPress?.(event);
    },
    [onPress],
  );
  return <RNTouchableOpacity {...rest} onPress={onPress ? handlePress : undefined} />;
}

export function Pressable(props: PressableProps) {
  const { onPress, ...rest } = props;
  const handlePress = useCallback<NonNullable<PressableProps['onPress']>>(
    event => {
      playTapSound();
      onPress?.(event);
    },
    [onPress],
  );
  return <RNPressable {...rest} onPress={onPress ? handlePress : undefined} />;
}
