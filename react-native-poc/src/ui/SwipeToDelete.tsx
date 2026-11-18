import React, { useMemo, useRef } from 'react';
import { Animated, PanResponder, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from './Text';
import { Pressable } from './tappable';
import { fonts, useTheme } from './theme';

/**
 * سطر في السلة ينسحب يمين أو يسار ويطلع تحته زر «حذف» أحمر.
 * سحبة طويلة (أكثر من نص العرض تقريباً) تحذف على طول.
 *
 * PanResponder من React Native نفسه، بدون مكتبة إضافية. ياخذ اللمسة بس
 * لما الحركة أفقية واضحة، فالتمرير العمودي في السلة يبقى زي ما هو.
 */
const ACTION_W = 84;
const FULL_SWIPE = 170;

export default function SwipeToDelete({
  onDelete,
  label,
  style,
  contentStyle,
  children,
}: {
  onDelete: () => void;
  label: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const x = useRef(new Animated.Value(0)).current;
  const base = useRef(0);
  const deleteRef = useRef(onDelete);
  deleteRef.current = onDelete;

  const settle = (to: number) => {
    base.current = to;
    Animated.spring(x, { toValue: to, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => {
          x.setValue(base.current + g.dx);
        },
        onPanResponderRelease: (_e, g) => {
          const pos = base.current + g.dx;
          if (Math.abs(pos) >= FULL_SWIPE) {
            base.current = 0;
            x.setValue(0);
            deleteRef.current();
            return;
          }
          settle(Math.abs(pos) > ACTION_W / 2 ? Math.sign(pos) * ACTION_W : 0);
        },
        onPanResponderTerminate: () => settle(0),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const action = (
    <Pressable
      onPress={() => {
        settle(0);
        deleteRef.current();
      }}
      style={{ width: ACTION_W, alignItems: 'center', justifyContent: 'center', gap: 3 }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M4 7h16" />
        <Path d="M10 11v6M14 11v6" />
        <Path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
        <Path d="M9 7V4h6v3" />
      </Svg>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 11, color: '#fff' }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      {/* زرين، واحد بكل جهة: السطر يغطي اللي ما انسحب له. */}
      <View
        style={{
          position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
          flexDirection: 'row', justifyContent: 'space-between',
          backgroundColor: colors.danger,
        }}
      >
        {action}
        {action}
      </View>
      <Animated.View
        {...responder.panHandlers}
        style={[{ backgroundColor: colors.cardBg, transform: [{ translateX: x }] }, contentStyle]}
      >
        {children}
      </Animated.View>
    </View>
  );
}
