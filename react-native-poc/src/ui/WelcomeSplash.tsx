import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from './Text';

/**
 * The brand moment, played once per launch.
 *
 * The iOS launch screen cannot animate — it is a storyboard the system
 * draws before any of our code runs. So it does the one thing it can do
 * well: it is the still frame the app icon expands INTO, on the icon's
 * own dark ground with the wordmark centred. This layer opens on exactly
 * that frame, so there is no cut between the two.
 *
 * Then one thing happens: the ground turns lime, and the wordmark that
 * was already sitting there recolours as the colour reaches it. The mark
 * never moves and never resizes — the world changes behind it. That is
 * what makes the storyboard and this read as one move rather than three
 * pictures shown in a row.
 *
 * A first attempt swept a rotated lime sheet across instead. Rendered as
 * real frames it turned out to be neither a sweep nor a diagonal: the
 * easing put the sheet fully in place by 140ms of its 420ms, so it read
 * as a hard cut, and the sheet was oversized enough that its rotated
 * edge never entered the screen at all. Both were removed rather than
 * tuned — motion nobody can see is not motion, it is just cost.
 *
 * It NEVER gates the app. It renders above a tree that is already
 * mounted and interactive, and removes itself on a timer.
 */

const GROUND = '#080B0A';
const LIME = '#C7FF4D';
const INK = '#0A0F0C';

/** The brief was "سريعة جداً". A splash that outstays a cold boot is one
 *  people learn to resent — so the whole thing is about a second, and the
 *  app underneath is live for all of it. */
const REVEAL_MS = 520;
const HOLD_MS = 300;
const FADE_MS = 240;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
/** Diameter that still covers the screen when grown from the centre. */
const DISC = Math.ceil(Math.hypot(SCREEN_W, SCREEN_H)) + 40;

const MARK_W = 200;
const MARK_H = 86;

export function WelcomeSplash({ onDone }: { onDone?: () => void }) {
  const [gone, setGone] = useState(false);
  const reveal = useRef(new Animated.Value(0)).current;
  const lineIn = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    let held: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      if (cancelled) return;
      setGone(true);
      onDone?.();
    };

    (async () => {
      // Someone who has asked the system to stop animations gets the end
      // state, not a shortened version of the motion.
      let reduced = false;
      try {
        reduced = await AccessibilityInfo.isReduceMotionEnabled();
      } catch {
        // Unavailable is not a reason to animate at someone.
      }
      if (cancelled) return;

      if (reduced) {
        reveal.setValue(1);
        lineIn.setValue(1);
        held = setTimeout(finish, HOLD_MS + FADE_MS);
        return;
      }

      Animated.sequence([
        Animated.parallel([
          Animated.timing(reveal, {
            toValue: 1,
            duration: REVEAL_MS,
            // Out-cubic, not a spring-like bezier: the colour has to be
            // visibly ARRIVING across most of the duration. The curve this
            // replaced finished a third of the way in.
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(lineIn, {
            toValue: 1,
            duration: 300,
            delay: 320,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(HOLD_MS),
        Animated.timing(fade, {
          toValue: 0,
          duration: FADE_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) finish();
      });
    })();

    // A splash that can get stuck is worse than no splash. This fires
    // whatever the animation did.
    const failsafe = setTimeout(finish, REVEAL_MS + HOLD_MS + FADE_MS + 1200);
    return () => {
      cancelled = true;
      clearTimeout(failsafe);
      if (held) clearTimeout(held);
    };
  }, [reveal, lineIn, fade, onDone]);

  if (gone) return null;

  // The mark recolours just behind the colour's leading edge, so the ink
  // version is only ever seen once the lime has actually reached it.
  const inkOpacity = reveal.interpolate({
    inputRange: [0, 0.42, 0.72, 1],
    outputRange: [0, 0, 1, 1],
  });
  const ivoryOpacity = reveal.interpolate({
    inputRange: [0, 0.42, 0.72, 1],
    outputRange: [1, 1, 0, 0],
  });

  return (
    <Animated.View style={[styles.root, { opacity: fade }]} pointerEvents="none">
      <Animated.View
        style={[
          styles.disc,
          {
            transform: [
              {
                scale: reveal.interpolate({
                  inputRange: [0, 1],
                  // From nothing at the mark's own centre: the first
                  // frame is then pixel-identical to the launch screen,
                  // so the hand-off between them cannot be seen at all.
                  outputRange: [0, 1],
                }),
              },
            ],
          },
        ]}
      />

      <View style={styles.center}>
        <View style={styles.markBox}>
          <Animated.Image
            source={require('../../assets/brand/rakeen-wordmark-ivory.png')}
            style={[styles.mark, { opacity: ivoryOpacity }]}
            resizeMode="contain"
          />
          <Animated.Image
            source={require('../../assets/brand/rakeen-wordmark-ink.png')}
            style={[styles.mark, styles.markOverlay, { opacity: inkOpacity }]}
            resizeMode="contain"
          />
        </View>

        <Animated.View
          style={{
            opacity: lineIn,
            transform: [
              {
                translateY: lineIn.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                }),
              },
            ],
          }}>
          <Text style={styles.line}>ابدأ أرباحك</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...(StyleSheet.absoluteFill as object), backgroundColor: GROUND, zIndex: 999 },
  disc: {
    position: 'absolute',
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    backgroundColor: LIME,
    left: (SCREEN_W - DISC) / 2,
    top: (SCREEN_H - DISC) / 2,
  },
  center: {
    ...(StyleSheet.absoluteFill as object),
    alignItems: 'center',
    justifyContent: 'center',
  },
  markBox: { width: MARK_W, height: MARK_H },
  mark: { width: MARK_W, height: MARK_H },
  markOverlay: { position: 'absolute', top: 0, left: 0 },
  line: {
    marginTop: 22,
    color: INK,
    fontSize: 17,
    fontFamily: 'IBMPlexSansArabic-SemiBold',
    opacity: 0.7,
  },
});
