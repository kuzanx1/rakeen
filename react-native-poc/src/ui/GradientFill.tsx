import React from 'react';
import { StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

/**
 * A gradient painted as a BACKGROUND LAYER, never as a layout box.
 *
 * react-native-linear-gradient is still a legacy native component --
 * `requireNativeComponent('BVLinearGradient')`, no codegenConfig, no
 * Fabric support -- and React Native 0.87 runs the New Architecture by
 * default, so every <LinearGradient> in this app goes through the legacy
 * interop layer. Under that layer the view's `padding` never reaches its
 * shadow node: measured on a real TestFlight build, every gradient button
 * in the app collapsed to its label's line height (20-21pt instead of
 * ~44pt) and painted over the label, which is why the pay button, "حفظ
 * الإعدادات" and "إعادة طباعة" all rendered as an empty lime sliver.
 *
 * The one gradient that rendered CORRECTLY is the proof: .product-icon is
 * the only one sized by an explicit `height: 72` instead of padding.
 * Width, flex and percentage sizes all arrive fine -- padding is the one
 * that is dropped.
 *
 * Upgrading is not available: 2.8.3 is the newest stable release, and the
 * Fabric-ready 3.0.0 line is alpha/beta only, which is not something to
 * put in a TestFlight build. So the layout stops depending on the native
 * view entirely -- an ordinary View owns the padding and the children,
 * and this only fills it:
 *
 *     <View style={styles.button}>          // padding, radius, shadow
 *       <GradientFill gradient={gradients.payButton} radius={radii.md} />
 *       <Text ... />                        // paints above the fill
 *     </View>
 *
 * Every gradient button style also carries a solid `backgroundColor`, so
 * that if the interop layer ever drops the absolute insets too, the
 * button degrades to a flat lime button at the correct size rather than
 * disappearing again.
 */
export interface Gradient {
  colors: string[];
  locations?: number[];
  start: { x: number; y: number };
  end: { x: number; y: number };
}

export default function GradientFill({ gradient, radius }: { gradient: Gradient; radius?: number }) {
  return (
    <LinearGradient
      colors={gradient.colors}
      locations={gradient.locations}
      start={gradient.start}
      end={gradient.end}
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, radius != null ? { borderRadius: radius } : null]}
    />
  );
}
