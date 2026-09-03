import React from 'react';
import Svg, { Path, Circle, Line, SvgProps } from 'react-native-svg';

/**
 * Real category icon set, ported path-for-path from public/pos/
 * rakeen-pos.js's `ICONS` object (line ~341) -- the same 8 icons the
 * PWA's cat-btn renders via `iconForCategory(name)`. Both functions
 * below mirror that file's ICONS map and iconForCategory() exactly:
 * same 8 keys, same Arabic-substring keyword rules, same 'bowl'
 * fallback -- not a reinterpretation.
 */
export type CategoryIconKey = 'cupHot' | 'cupCold' | 'pastry' | 'burger' | 'pizza' | 'bowl' | 'cake' | 'water';

function IconSvg({ children, ...props }: SvgProps & { children: React.ReactNode }) {
  return (
    <Svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      {children}
    </Svg>
  );
}

const ICONS: Record<CategoryIconKey, (props: SvgProps) => React.JSX.Element> = {
  cupHot: props => (
    <IconSvg {...props}>
      <Path d="M4 9h13v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9z" />
      <Path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17" />
      <Path d="M8 3c0 1-1 1-1 2s1 1 1 2M12 3c0 1-1 1-1 2s1 1 1 2" />
    </IconSvg>
  ),
  cupCold: props => (
    <IconSvg {...props}>
      <Path d="M6 8l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12" />
      <Path d="M4 8h16l-1.5-4h-13z" />
      <Line x1={14} y1={3} x2={10} y2={10} />
    </IconSvg>
  ),
  pastry: props => (
    <IconSvg {...props}>
      <Path d="M3 15c2-6 6-10 9-10s3 2 1 3c3 0 5 2 5 4 0 4-6 9-11 9-2 0-4-2-4-6z" />
    </IconSvg>
  ),
  burger: props => (
    <IconSvg {...props}>
      <Path d="M4 10a8 4 0 0 1 16 0z" />
      <Line x1={3} y1={13} x2={21} y2={13} />
      <Path d="M4 16h16" />
      <Path d="M5 19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2" />
    </IconSvg>
  ),
  pizza: props => (
    <IconSvg {...props}>
      <Path d="M12 3l9 18-18 0z" />
      <Circle cx={12} cy={12} r={1} />
      <Circle cx={10} cy={16} r={1} />
      <Circle cx={14} cy={16} r={1} />
    </IconSvg>
  ),
  bowl: props => (
    <IconSvg {...props}>
      <Path d="M3 12h18a9 6 0 0 1-18 0z" />
      <Line x1={12} y1={12} x2={12} y2={4} />
    </IconSvg>
  ),
  cake: props => (
    <IconSvg {...props}>
      <Path d="M4 20V11l8-7 8 7v9z" />
      <Line x1={4} y1={15} x2={20} y2={15} />
      <Line x1={12} y1={4} x2={12} y2={11} />
    </IconSvg>
  ),
  water: props => (
    <IconSvg {...props}>
      <Path d="M9 2h6v3l2 2v13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7l2-2z" />
      <Line x1={7} y1={11} x2={17} y2={11} />
    </IconSvg>
  ),
};

/** rakeen-pos.js's iconForCategory(name) -- same Arabic-substring rules,
 *  same order, same 'bowl' default. */
export function iconForCategoryName(name: string | null | undefined): CategoryIconKey {
  if (!name) return 'bowl';
  if (name.includes('ساخن') || name.includes('قهوة')) return 'cupHot';
  if (name.includes('بارد')) return 'cupCold';
  if (name.includes('حلا') || name.includes('كيك')) return 'cake';
  if (name.includes('مخبوز')) return 'pastry';
  if (name.includes('رئيسي') || name.includes('برجر')) return 'burger';
  if (name.includes('بيتزا')) return 'pizza';
  if (name.includes('ماء') || name.includes('مياه')) return 'water';
  return 'bowl';
}

export function CategoryIcon({ name, ...props }: SvgProps & { name: CategoryIconKey }) {
  const Comp = ICONS[name];
  return <Comp {...props} />;
}
