import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { createStyles, fonts, radii } from './theme';

/**
 * showToast(), ported from rakeen-pos.js:448 with the source's own values.
 *
 *   .toast      position:fixed; bottom:80px; left:50%;
 *               transform:translateX(-50%) translateY(10px);
 *               background:var(--card-bg); border:1px solid var(--line);
 *               padding:13px 22px; border-radius:var(--r-md);
 *               font-weight:700; font-size:13px; gap:8px;
 *               box-shadow:var(--shadow-md); opacity:0;
 *               transition:opacity .2s ease, transform .2s ease
 *   .toast.show opacity:1; transform:translateX(-50%) translateY(0)
 *   .toast-dot  6x6 circle, var(--lime-deep)
 *
 * The timer is the source's too: 2200ms, restarted rather than stacked, so
 * a run of quick taps leaves one toast that keeps updating instead of a
 * queue the cashier has to sit through.
 *
 * This replaces the inline status line the order panel printed messages
 * into. That line has no equivalent in the source: it pushed the panel's
 * layout around every time it appeared and then stayed on screen until
 * something else replaced it.
 */

interface ToastApi {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastApi>({ showToast: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const VISIBLE_MS = 2200;
const FADE_MS = 200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  const [message, setMessage] = useState('');
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (next: string) => {
      if (!next) return;
      setMessage(next);
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(anim, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(
          ({ finished }) => {
            // Cleared only if the fade actually finished -- a toast raised
            // again mid-fade must not have its text wiped out from under
            // it.
            if (finished) setMessage('');
          },
        );
      }, VISIBLE_MS);
    },
    [anim],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const value = useMemo<ToastApi>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {!!message && (
        // The outer row spans the width purely to centre the pill, the way
        // left:50% + translateX(-50%) does on the web without needing the
        // box's own width. Never intercepts a tap: pointer-events:none.
        <Animated.View
          pointerEvents="none"
          style={[
            styles.layer,
            {
              opacity: anim,
              transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            },
          ]}>
          <View style={styles.pill}>
            <View style={styles.dot} />
            <Text style={styles.text}>{message}</Text>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const useStyles = createStyles((colors, shadows) =>
  StyleSheet.create({
    layer: {
      position: 'absolute',
      bottom: 80,
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 200,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 13,
      paddingHorizontal: 22,
      borderRadius: radii.md,
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.line,
      ...shadows.md,
    },
    // .toast-dot -- lime-deep in light, lime in dark, which is exactly
    // what accentText already resolves to per theme.
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accentText },
    text: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text },
  }),
);
