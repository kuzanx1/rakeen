import React, { useMemo, useRef } from 'react';
import { Animated, PanResponder, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from './Text';
import { fonts, useTheme } from './theme';

/**
 * سطر في السلة: تسحبه يمين أو يسار ويتحذف على طول، بدون تأكيد (طلب
 * المالك). سحبة قصيرة (أقل من DELETE_AT) ترجع مكانها، عشان لمسة عابرة
 * ما تحذف.
 *
 * PanResponder من React Native نفسه، بدون مكتبة إضافية. ياخذ اللمسة بس
 * لما الحركة أفقية واضحة، فالتمرير العمودي في السلة يبقى زي ما هو.
 */
const DELETE_AT = 80;

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
  const deleteRef = useRef(onDelete);
  deleteRef.current = onDelete;

  const settle = (to: number) => {
    Animated.spring(x, { toValue: to, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => {
          x.setValue(g.dx);
        },
        onPanResponderRelease: (_e, g) => {
          if (Math.abs(g.dx) >= DELETE_AT) {
            x.setValue(0);
            deleteRef.current();
            return;
          }
          settle(0);
        },
        onPanResponderTerminate: () => settle(0),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const action = (
    <View style={{ width: 84, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M4 7h16" />
        <Path d="M10 11v6M14 11v6" />
        <Path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
        <Path d="M9 7V4h6v3" />
      </Svg>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 11, color: '#fff' }}>{label}</Text>
    </View>
  );

  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      {/* علامة «حذف» بكل جهة: السطر يغطي اللي ما انسحب له. */}
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
