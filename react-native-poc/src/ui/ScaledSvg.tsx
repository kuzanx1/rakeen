import React from 'react';
import Svg, { SvgProps } from 'react-native-svg';
import { useTheme } from './theme';

/**
 * <Svg> اللي يكبر ويصغر مع الشاشة (theme.ts autoScaleFor).
 *
 * الأيقونات مقاسها props (width={16}) مو style، فـcreateStyles ما يوصلها.
 * كل أيقونة فيها viewBox، فتكبير العرض والارتفاع يكبّر الرسم معه.
 */
export default function ScaledSvg({ width, height, ...rest }: SvgProps) {
  const { scale } = useTheme();
  const s = (v: SvgProps['width']) => (typeof v === 'number' ? v * scale : v);
  return <Svg width={s(width)} height={s(height)} {...rest} />;
}
