import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { TouchableOpacity } from './tappable';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import { createStyles, fonts, radii, useTheme } from './theme';
import { useShell } from './shell';
import { useI18n } from './i18n';

/**
 * <header class="topbar"> (pos/page.tsx), styled by rakeen-pos.css:89-138
 * and re-laid-out for phones by rakeen-pos-additions.css:451-467.
 *
 * Audited against the running page rather than the stylesheet, because
 * several of its children are conditionally hidden and the source's own
 * comments explain why. In DOM order -- which is right-to-left on screen:
 *
 *   .identity-cluster   wordmark + business/branch name
 *   .status-group       connection pill + printer pill   (phone: hidden)
 *   .notif-bell         30px circle, red dot when unread
 *   .theme-toggle       30px circle, sun in light / moon in dark
 *   .lang-toggle        "EN", mono 11/800, pill
 *   .user-cluster       divider, then switch-staff and logout
 *   .tb-clock           mono 11.5/700                    (phone: hidden)
 *
 * Two of these look like omissions but are deliberate, and the source
 * says so in its own words:
 *
 *  - `.user-cluster .identity-text{display:none}` at BASE, every width.
 *    The cashier's name/role line "was pure clutter with no fallback name
 *    set (shows بدون اسم)". So the topbar never shows who is on shift;
 *    that lives in المزيد ← الإعدادات. This app was printing
 *    `cashier.full_name` as the topbar's only content -- the one thing the
 *    source specifically removed.
 *  - `.user-avatar{display:none}` at BASE too, "dropped from the topbar
 *    entirely per explicit feedback". Only ↺ and ⏻ survive, because they
 *    "are the actual controls, not just decoration".
 *
 * Geometry measured live at 375x812, light theme:
 *   .topbar         h58 (+ safe-area top), position:fixed, z30,
 *                   padding-inline 12, gap 8, bg --bg, 1px bottom line
 *   .notif-bell     30x30 r50% surf1 + 1px line, 16px glyph
 *   .theme-toggle   30x30, margin-inline-start 6, 15px glyph
 *   .lang-toggle    35.2x30, padding-inline 10, r-full, mono 11/800
 *   .auth-util-btn  32x32 r50% surf1 + 1px line, 13px glyph
 *   .identity-name  12/800, line-height 15, max-width 68, ellipsised
 * At >=761px the base rule applies instead: h52, gap 10, padding 0 16.
 */

/** .notif-bell-dot uses `left:6px` -- a PHYSICAL left, not a logical
 *  inset, so it stays on the same corner of the circle in both
 *  directions. Kept physical here for the same reason. */
const BELL_DOT_LEFT = 6;

export default function Topbar({
  businessName,
  branchName,
  online,
  printerLabel,
  unreadNotifications,
  onPressBell,
  onSwitchStaff,
  onLogout,
  onToggleLang,
  style,
  onLayout,
}: {
  businessName?: string | null;
  branchName?: string | null;
  online: boolean;
  /** #printerStatus's label -- "بدون طابعة شبكة" until one is configured. */
  printerLabel: string;
  unreadNotifications: boolean;
  onPressBell?: () => void;
  onSwitchStaff?: () => void;
  onLogout?: () => void;
  onToggleLang?: () => void;
  style?: StyleProp<ViewStyle>;
  onLayout?: (h: number) => void;
}) {
  const { colors, mode, toggle } = useTheme();
  const styles = useStyles();
  const { sideBySide } = useShell();
  const { lang, t, toggle: toggleLang } = useI18n();
  const [now, setNow] = useState(() => new Date());

  // #clock ticks once a minute in the source; a 1s timer would redraw the
  // whole bar 60x more often for a display that only shows hh:mm.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // ar-SA gives the Arabic-Indic digits and م/ص suffix the source shows.
  const clock = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

  return (
    <View
      style={[styles.topbar, sideBySide && styles.topbarWide, style]}
      onLayout={e => onLayout?.(e.nativeEvent.layout.height)}>
      {/* .identity-cluster -- on phones `.identity-cluster .identity-text`
          is hidden, so the wordmark stands alone; the names return at
          >=761px, and .identity-branch only there. */}
      <View style={styles.identityCluster}>
        <Image
          source={require('../../assets/brand/rakeen-wordmark.png')}
          style={styles.brandAvatar}
          resizeMode="contain"
          accessibilityLabel="ركين"
        />
        {sideBySide && (
          <View style={styles.identityText}>
            <Text style={styles.identityName} numberOfLines={1}>
              {businessName || '—'}
            </Text>
            <Text style={styles.identityBranch} numberOfLines={1}>
              {branchName || '—'}
            </Text>
          </View>
        )}
      </View>

      {/* .status-group -- `display:none` below 761px */}
      {sideBySide && (
        <View style={styles.statusGroup}>
          <View style={styles.statusPill}>
            <View style={[styles.statusDot, { backgroundColor: online ? colors.limeDeep : colors.danger }]} />
            <Text style={styles.statusPillText}>{online ? t('متصل بالإنترنت') : t('غير متصل — يحفظ محليًا')}</Text>
          </View>
          <View style={styles.statusPill}>
            <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={colors.muted} strokeWidth={2}>
              <Polyline points="6 9 6 2 18 2 18 9" />
              <Path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <Rect x={6} y={14} width={12} height={8} />
            </Svg>
            <Text style={styles.statusPillText}>{printerLabel}</Text>
          </View>
        </View>
      )}

      {/* .notif-bell */}
      <TouchableOpacity style={styles.notifBell} onPress={onPressBell} accessibilityLabel={t('تنبيهات التوصيل')}>
        <Svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.muted}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round">
          <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </Svg>
        {/* .notif-bell-dot -- `display:none` until there is something to
            report, so an always-on dot would read as a permanent alert. */}
        {unreadNotifications && <View style={styles.notifBellDot} />}
      </TouchableOpacity>

      {/* .theme-toggle -- `.icon-light` is hidden at base and revealed by
          `[data-theme="light"]`, so LIGHT shows the sun and DARK the moon. */}
      <TouchableOpacity onPress={toggle} style={styles.themeToggle} accessibilityLabel={t('تبديل المظهر')}>
        <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={colors.muted} strokeWidth={2}>
          {mode === 'dark' ? (
            <Path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          ) : (
            <>
              <Circle cx={12} cy={12} r={5} />
              <Line x1={12} y1={1} x2={12} y2={3} />
              <Line x1={12} y1={21} x2={12} y2={23} />
              <Line x1={4.22} y1={4.22} x2={5.64} y2={5.64} />
              <Line x1={18.36} y1={18.36} x2={19.78} y2={19.78} />
              <Line x1={1} y1={12} x2={3} y2={12} />
              <Line x1={21} y1={12} x2={23} y2={12} />
              <Line x1={4.22} y1={19.78} x2={5.64} y2={18.36} />
              <Line x1={18.36} y1={5.64} x2={19.78} y2={4.22} />
            </>
          )}
        </Svg>
      </TouchableOpacity>

      {/* .lang-toggle -- mono, not the Arabic sans the rest of the bar uses */}
      <TouchableOpacity onPress={onToggleLang ?? toggleLang} style={styles.langToggle} accessibilityLabel="Language / اللغة">
        {/* Shows the language it switches TO, so the label is an action
            rather than a statement of the current state. */}
        <Text style={styles.langToggleText}>{lang === 'ar' ? 'EN' : 'ع'}</Text>
      </TouchableOpacity>

      {/* .user-cluster -- a divider rule, then the two controls. The name,
          role and avatar are all `display:none` at every width. */}
      <View style={styles.userCluster}>
        <TouchableOpacity style={styles.authUtilBtn} onPress={onSwitchStaff} accessibilityLabel="تبديل الموظف">
          <Text style={styles.authUtilGlyph}>↺</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.authUtilBtn, styles.authUtilBtnLast]} onPress={onLogout} accessibilityLabel="تسجيل خروج">
          <Text style={styles.authUtilGlyph}>⏻</Text>
        </TouchableOpacity>
      </View>

      {/* .tb-clock -- `display:none` below 761px */}
      {sideBySide && <Text style={styles.tbClock}>{clock}</Text>}
    </View>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
    /* Phone rule (rakeen-pos-additions.css:452): fixed, z30, h58, gap 8,
       padding-inline 12. The safe-area top the CSS adds via env() is
       supplied by the SafeAreaView this sits inside. */
    topbar: {
      height: 58,
      flexShrink: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      backgroundColor: colors.bg,
      zIndex: 30,
    },
    /* Base rule (rakeen-pos.css:90), which is what actually applies at
       >=761px once the phone override drops out: h52, gap 10, pad 0 16. */
    topbarWide: { height: 52, gap: 10, paddingHorizontal: 16, zIndex: 20 },

    identityCluster: { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 0, minWidth: 0 },
    // inline `height:20px; width:auto` on the element itself
    brandAvatar: { height: 20, width: 46 },
    identityText: { flexDirection: 'column', minWidth: 0 },
    identityName: { fontFamily: fonts.sansBold, fontSize: 12, lineHeight: 15, color: colors.text, maxWidth: 68 },
    identityBranch: { fontFamily: fonts.sansSemiBold, fontSize: 9.5, lineHeight: 11.875, color: colors.muted },

    statusGroup: { flexDirection: 'row', gap: 6, flexShrink: 0 },
    // .status-pill -- radius is a literal 20px here, not --r-full
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 5,
      paddingHorizontal: 9,
      borderRadius: 20,
      backgroundColor: colors.surf1,
    },
    statusPillText: { fontFamily: fonts.sansBold, fontSize: 10, lineHeight: 15, color: colors.muted },
    statusDot: { width: 6, height: 6, borderRadius: 3 },

    notifBell: {
      position: 'relative',
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surf1,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    notifBellDot: {
      position: 'absolute',
      top: 5,
      left: BELL_DOT_LEFT,
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: colors.danger,
      borderWidth: 2,
      borderColor: colors.bg,
    },

    themeToggle: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surf1,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      marginStart: 6,
    },

    langToggle: {
      height: 30,
      paddingHorizontal: 10,
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surf1,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      marginStart: 6,
    },
    langToggleText: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.muted },

    // `padding-inline-start:8px; border-inline-start:1px solid var(--line);
    //  margin-inline-start:2px`, with the phone rule's gap of 6.
    userCluster: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexShrink: 0,
      paddingStart: 8,
      borderStartWidth: 1,
      borderStartColor: colors.line,
      marginStart: 2,
    },
    authUtilBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surf1,
      alignItems: 'center',
      justifyContent: 'center',
      marginStart: 8,
    },
    // the logout button's own inline `margin-inline-start:6px`
    authUtilBtnLast: { marginStart: 6 },
    authUtilGlyph: { fontSize: 13, lineHeight: 19.5, color: colors.muted },

    tbClock: { fontFamily: fonts.monoBold, fontSize: 11.5, lineHeight: 17.25, color: colors.muted, flexShrink: 0 },
  }),
);
