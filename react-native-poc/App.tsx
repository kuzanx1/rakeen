/**
 * Rakeen React Native POC — Phase 7
 *
 * Proves ONE full path end to end: React Native UI -> JS -> NativeModules
 * -> Swift (iOS) / Kotlin (Android) -> a real TCP socket. Deliberately not
 * a rebuilt POS — see docs/react-native-poc/phase7-poc-screen.md for what
 * this does and does not prove, and docs/react-native-poc/phase1-audit.md
 * for why the real POS UI isn't attempted here (no DOM/Canvas in RN).
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { TouchableOpacity } from './src/ui/tappable';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { Printer, printReceipt } from './src/platform/printer';
import { CashDrawer, openCashDrawer } from './src/platform/cashDrawer';
import { getDeviceInfo, DeviceInfo } from './src/platform/device';
import LoginScreen from './src/ui/LoginScreen';
import ProductsScreen, { SelectedTableContext } from './src/ui/ProductsScreen';
import TablesScreen from './src/ui/TablesScreen';
import type { CashierProfile } from './src/domain/auth';
import { logout, getDeviceConfig } from './src/application/authService';
import { startAutoSync } from './src/application/syncScheduler';
import { startPrintQueueAutoProcess } from './src/application/printQueueScheduler';
import { resetInterruptedPrintJobsOnBoot } from './src/infrastructure/sqlitePrintQueue';
import PrintQueueScreen from './src/ui/PrintQueueScreen';
import PrinterSettingsScreen from './src/ui/PrinterSettingsScreen';
import uuid from 'react-native-uuid';
import { getPrinterProfile } from './src/infrastructure/printerProfileStore';
import { profileToPrinterTarget, drawerKickCommandFor, isDrawerSupported } from './src/domain/printerProfile';
import { startDiagnosticsTracking } from './src/application/diagnosticsService';
import { getNotifySoundEnabled } from './src/application/catalogService';
import { setNotifySoundEnabled } from './src/application/soundService';
import DiagnosticsScreen from './src/ui/DiagnosticsScreen';
import OrderHistoryScreen from './src/ui/OrderHistoryScreen';
import { createStyles, fonts, radii, spacing, ThemeProvider, useTheme } from './src/ui/theme';

/** React Native's Hermes runtime has no global `btoa` (unlike a browser) —
 *  a minimal base64 encoder, since pulling in a whole polyfill package for
 *  one POC helper isn't worth it. */
function bytesToBase64(bytes: number[]): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 !== undefined ? b1 >> 4 : 0)];
    result += b1 !== undefined ? chars[((b1 & 15) << 2) | (b2 !== undefined ? b2 >> 6 : 0)] : '=';
    result += b2 !== undefined ? chars[b2 & 63] : '=';
  }
  return result;
}

/** Plain ASCII ESC/POS test receipt — init + text lines + cut. Deliberately
 *  NOT Arabic/rasterized (see phase1-audit.md's Canvas finding) — this POC
 *  proves the transport path, not receipt rendering. */
function buildTestReceiptBase64(): string {
  const ESC = 0x1b;
  const bytes: number[] = [];
  bytes.push(ESC, 0x40); // ESC @ — initialize
  const line = (text: string) => {
    for (const ch of text) bytes.push(ch.charCodeAt(0));
    bytes.push(0x0a);
  };
  line('RAKEEN POC TEST RECEIPT');
  line('------------------------');
  line(`Time: ${new Date().toISOString()}`);
  line('This is a plain ASCII test.');
  line('Arabic rendering is a separate,');
  line('not-yet-solved problem (see audit).');
  bytes.push(0x0a, 0x0a, 0x0a);
  bytes.push(0x1d, 0x56, 0x00); // GS V 0 — full cut
  return bytesToBase64(bytes);
}

/**
 * Real top-level app: real login (Checkpoint 2) is the primary screen,
 * per the explicit instruction to start with the real POS, not a demo.
 * The hardware POC tools (Test Printer / Print Test Receipt / Open Cash
 * Drawer -- Checkpoints 10-12's foundation) stay reachable, not deleted,
 * since they're still the only way to exercise the printer/drawer path
 * until a real order/payment screen exists.
 */
/**
 * Checkpoint 7 (Dine-in / Tables) -- a minimal screen switcher, no
 * navigation library (matches the rest of this app's zero-dependency
 * approach; a real nav stack is not something this checkpoint's scope
 * requires). 'products' is keyed by the selected table's id so React
 * remounts ProductsScreen fresh (fresh cart, fresh
 * lastRegisteredDineInOrderId seeded from that table's real
 * active_order_id) every time a different table is opened, instead of
 * carrying over stale per-table state across navigations.
 *
 * Visual-parity pass: replaced the old top-of-screen row of 8 text
 * links (never anything in the real PWA) with the PWA's actual
 * navigation shape -- a 4-tab .bottom-nav (Home/Orders/Tables/More),
 * same SVG icon paths as pos-markup.ts, same active-color rule. Items
 * that don't map to one of those 4 real PWA tabs (print queue/printer
 * settings/diagnostics/hardware tools/logout) live under "المزيد"
 * (More), matching the PWA's own screen-more as the place secondary
 * actions belong.
 */
type Screen =
  | { name: 'tables' }
  | { name: 'printQueue' }
  | { name: 'printerSettings' }
  | { name: 'diagnostics' }
  | { name: 'orderHistory' }
  | { name: 'more' }
  | { name: 'products'; table: SelectedTableContext | null };

type NavTab = 'home' | 'orders' | 'tables' | 'more';

function screenToTab(screen: Screen): NavTab {
  switch (screen.name) {
    case 'orderHistory':
      return 'orders';
    case 'tables':
      return 'tables';
    case 'printQueue':
    case 'printerSettings':
    case 'diagnostics':
    case 'more':
      return 'more';
    default:
      return 'home';
  }
}

function App(): React.JSX.Element {
  const { colors, mode, toggle } = useTheme();
  const styles = useStyles();
  const [cashier, setCashier] = useState<CashierProfile | null>(null);
  const [showHardwareTools, setShowHardwareTools] = useState(false);
  const [screen, setScreen] = useState<Screen>({ name: 'products', table: null });
  const [branchId, setBranchId] = useState<number | null>(null);
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [drawerStatus, setDrawerStatus] = useState('');

  useEffect(() => {
    if (!cashier) return;
    (async () => {
      const device = await getDeviceConfig();
      setBranchId(device.branchId);
      // NOTIFY_SOUND_ENABLED (rakeen-pos.js:5889) -- read once per
      // session out of the same businesses row loadPosData() reads it
      // from. Failure leaves the default (on) in place rather than
      // silencing alerts, matching the source's own fallback.
      if (device.businessId != null) {
        try {
          setNotifySoundEnabled(await getNotifySoundEnabled(device.businessId));
        } catch {
          // keep the default -- a POS that silently stops alerting
          // because one settings read failed is worse than a stray beep
        }
      }
    })();
  }, [cashier]);

  // Checkpoint 9 (Offline Queue + Sync) -- the queue/algorithm/storage
  // all existed since Checkpoint 5, but nothing ever triggered it
  // automatically. Starts on login (also flushes anything queued from a
  // previous session), stops on logout -- syncing while logged out would
  // just fail every RPC's has_permission() check anyway.
  useEffect(() => {
    if (!cashier) return;
    return startAutoSync();
  }, [cashier]);

  // Checkpoint 10 (Print Queue) -- same shape: reset anything left
  // stuck mid-flight from a previous killed session BEFORE the
  // scheduler's first pass (ported from the PWA's
  // resetInterruptedPrintJobsOnBoot), then start the real auto-process
  // loop (NetInfo reconnect + 20s interval). Stops on logout for the
  // same reason startAutoSync does -- has_permission() needs a valid
  // session, and printerProfileStore.ts's target lookup has no reason to run
  // for a logged-out device.
  useEffect(() => {
    if (!cashier) return;
    let stopScheduler: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      await resetInterruptedPrintJobsOnBoot();
      if (!cancelled) stopScheduler = startPrintQueueAutoProcess();
    })();
    return () => {
      cancelled = true;
      stopScheduler?.();
    };
  }, [cashier]);

  // Checkpoint 13 (Diagnostics, final checkpoint) -- tracks the real
  // Internet signal for the Diagnostics screen; the Cloud signal is
  // reported separately by syncScheduler.ts's own real sync attempts
  // (see diagnosticsService.ts's own doc comment for why this is
  // deliberately NOT a dedicated health-check ping).
  useEffect(() => {
    if (!cashier) return;
    return startDiagnosticsTracking();
  }, [cashier]);

  /**
   * Checkpoint 12 (Cash Drawer) -- the real manual "فتح الدرج" quick
   * action, ported from the PWA's own QUICK_ACTIONS/openCashDrawer()
   * (public/pos/rakeen-pos.js): a single tap, reachable independent of
   * any active order/payment, with the same three honest outcomes the
   * source reports (real success, native bridge unavailable, any other
   * real failure) -- never a fake "تم فتح الدرج" unless the native
   * layer genuinely confirms it. Uses the REAL configured PrinterProfile
   * (Checkpoint 11), not the Hardware Tools screen's manual host/port
   * entry. A fresh operationId per tap is the correct idempotency
   * key here (this is a deliberate, standalone action, not tied to a
   * specific payment's client_order_uuid) -- `drawerBusy` disables the
   * button while a request is in flight, which is what actually
   * prevents a rapid double-tap from firing two logical operations in
   * the first place; if one somehow still reached openCashDrawer()
   * twice for the SAME operationId, platform/cashDrawer.ts's own
   * dedup (Checkpoint 1, now backed by the pure, tested
   * domain/drawerIdempotency.ts) guarantees only one real native kick.
   */
  const handleOpenDrawerManually = async () => {
    setDrawerBusy(true);
    setDrawerStatus('');
    try {
      const profile = await getPrinterProfile();
      if (!isDrawerSupported(profile)) {
        setDrawerStatus('⚠ فتح الدرج غير متاح — لا توجد طابعة مُعدة بدرج (راجع إعدادات الطابعة)');
        return;
      }
      const target = profileToPrinterTarget(profile);
      if (!target) {
        setDrawerStatus('⚠ فتح الدرج غير متاح — الإعداد الحالي غير صالح (راجع إعدادات الطابعة)');
        return;
      }
      const result = await openCashDrawer({
        target,
        kickCommandBase64: drawerKickCommandFor(profile),
        timeoutMs: 8000,
        operationId: `manual-${uuid.v4()}`,
      });
      if (result.ok) {
        setDrawerStatus('✅ تم فتح الدرج');
      } else if (result.error === 'CASH_DRAWER_UNAVAILABLE') {
        setDrawerStatus('⚠ فتح الدرج غير متاح بعد — لا توجد وحدة درج أصلية على هذا الجهاز');
      } else {
        setDrawerStatus(`⚠ تعذّر فتح الدرج — تحقق من الاتصال${result.errorDetail ? ` (${result.errorDetail})` : ''}`);
      }
    } catch (e) {
      setDrawerStatus(`⚠ خطأ غير متوقع: ${String(e)}`);
    } finally {
      setDrawerBusy(false);
    }
  };

  if (showHardwareTools) {
    return <HardwareToolsScreen onBack={() => setShowHardwareTools(false)} />;
  }

  if (!cashier) {
    return <LoginScreen onLoggedIn={setCashier} />;
  }

  const activeTab = screenToTab(screen);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>{cashier.full_name || 'بدون اسم'}</Text>
        {/* .theme-toggle (rakeen-pos.css:123) -- 30px circle, surf1 fill,
            line border, muted icon. Shows the moon (.icon-dark) while dark
            is active and the sun (.icon-light) while light is, exactly as
            the [data-theme="light"] display rules swap them. Session-only,
            like the source's own handler. */}
        <TouchableOpacity onPress={toggle} style={styles.themeToggle} accessibilityLabel="تبديل المظهر">
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
      </View>
      {!!drawerStatus && (
        <View style={styles.drawerStatusBanner}>
          <Text style={styles.drawerStatusText}>{drawerStatus}</Text>
        </View>
      )}
      <View style={styles.screenArea}>
        {screen.name === 'tables' && branchId != null ? (
          <TablesScreen
            branchId={branchId}
            onBeginOrderForTable={table => setScreen({ name: 'products', table })}
          />
        ) : screen.name === 'more' ? (
          <MoreScreen
            onOpenPrintQueue={() => setScreen({ name: 'printQueue' })}
            onOpenPrinterSettings={() => setScreen({ name: 'printerSettings' })}
            onOpenDiagnostics={() => setScreen({ name: 'diagnostics' })}
            onOpenHardwareTools={() => setShowHardwareTools(true)}
            onOpenDrawer={handleOpenDrawerManually}
            drawerBusy={drawerBusy}
            onLogout={async () => {
              await logout();
              setCashier(null);
            }}
          />
        ) : screen.name === 'printQueue' ? (
          <PrintQueueScreen />
        ) : screen.name === 'printerSettings' ? (
          <PrinterSettingsScreen />
        ) : screen.name === 'diagnostics' ? (
          <DiagnosticsScreen />
        ) : screen.name === 'orderHistory' && branchId != null ? (
          <OrderHistoryScreen branchId={branchId} />
        ) : (
          <ProductsScreen
            key={screen.name === 'products' ? screen.table?.id ?? 'no-table' : 'no-table'}
            cashier={cashier}
            selectedTable={screen.name === 'products' ? screen.table : null}
            onExitTableContext={() => setScreen({ name: 'tables' })}
          />
        )}
      </View>

      {/* .bottom-nav / .nav-tab (rakeen-pos.css:351-354) -- same 4 tabs,
          same SVG icon paths, same active-color rule as pos-markup.ts. */}
      <View style={styles.bottomNav}>
        <NavTabButton
          active={activeTab === 'home'}
          label="الرئيسية"
          onPress={() => setScreen({ name: 'products', table: null })}
          icon={<Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />}
        />
        <NavTabButton
          active={activeTab === 'orders'}
          label="الطلبات"
          onPress={() => setScreen({ name: 'orderHistory' })}
          icon={
            <>
              <Path d="M9 11l3 3L22 4" />
              <Path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </>
          }
        />
        <NavTabButton
          active={activeTab === 'tables'}
          label="الطاولات"
          onPress={() => setScreen({ name: 'tables' })}
          icon={
            <>
              <Rect x={3} y={3} width={7} height={7} />
              <Rect x={14} y={3} width={7} height={7} />
              <Rect x={3} y={14} width={7} height={7} />
              <Rect x={14} y={14} width={7} height={7} />
            </>
          }
        />
        <NavTabButton
          active={activeTab === 'more'}
          label="المزيد"
          onPress={() => setScreen({ name: 'more' })}
          icon={
            <>
              <Circle cx={12} cy={12} r={1} />
              <Circle cx={19} cy={12} r={1} />
              <Circle cx={5} cy={12} r={1} />
            </>
          }
        />
      </View>
    </SafeAreaView>
  );
}

function NavTabButton({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  // .nav-tab.active -- --lime-deep, overridden to --lime in dark
  const tint = active ? colors.accentText : colors.muted;
  return (
    <TouchableOpacity style={styles.navTab} onPress={onPress} activeOpacity={0.7}>
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {icon}
      </Svg>
      <Text style={[styles.navTabLabel, { color: tint }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * .screen-more equivalent -- houses everything that isn't one of the 4
 * real bottom-nav destinations: print queue, printer settings,
 * diagnostics, the manual drawer-kick quick action, the RN-only hardware
 * POC tools, and logout.
 */
function MoreScreen({
  onOpenPrintQueue,
  onOpenPrinterSettings,
  onOpenDiagnostics,
  onOpenHardwareTools,
  onOpenDrawer,
  drawerBusy,
  onLogout,
}: {
  onOpenPrintQueue: () => void;
  onOpenPrinterSettings: () => void;
  onOpenDiagnostics: () => void;
  onOpenHardwareTools: () => void;
  onOpenDrawer: () => void;
  drawerBusy: boolean;
  onLogout: () => void;
}) {
  const styles = useStyles();
  return (
    <ScrollView style={styles.moreRoot} contentContainerStyle={styles.moreScroll}>
      <MoreRow label="فتح الدرج" onPress={onOpenDrawer} disabled={drawerBusy} busyLabel="جارٍ الفتح..." busy={drawerBusy} />
      <MoreRow label="قائمة الطباعة" onPress={onOpenPrintQueue} />
      <MoreRow label="إعدادات الطابعة" onPress={onOpenPrinterSettings} />
      <MoreRow label="تشخيص النظام" onPress={onOpenDiagnostics} />
      <MoreRow label="أدوات الطابعة" onPress={onOpenHardwareTools} />
      <View style={styles.moreDivider} />
      <MoreRow label="خروج" onPress={onLogout} danger />
    </ScrollView>
  );
}

function MoreRow({
  label,
  onPress,
  disabled,
  danger,
  busy,
  busyLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  busy?: boolean;
  busyLabel?: string;
}) {
  const styles = useStyles();
  return (
    <TouchableOpacity style={styles.moreRow} onPress={onPress} disabled={disabled} activeOpacity={0.8}>
      <Text style={[styles.moreRowText, danger && styles.moreRowTextDanger]}>{busy && busyLabel ? busyLabel : label}</Text>
    </TouchableOpacity>
  );
}

function HardwareToolsScreen({ onBack }: { onBack: () => void }): React.JSX.Element {
  const { colors, mode } = useTheme();
  const styles = useStyles();
  const [host, setHost] = useState('192.168.1.50');
  const [port, setPort] = useState('9100'); // a UI default only — never assumed by the contract itself
  const [network, setNetwork] = useState<NetInfoState | null>(null);
  const [printerStatus, setPrinterStatus] = useState('لم يُختبر بعد');
  const [bridgeStatus, setBridgeStatus] = useState('جارٍ الفحص...');
  const [log, setLog] = useState<string[]>([]);

  const appendLog = (line: string) =>
    setLog(prev => [`${new Date().toLocaleTimeString()} — ${line}`, ...prev].slice(0, 20));

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => setNetwork(state));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    (async () => {
      const info: DeviceInfo = await getDeviceInfo();
      setBridgeStatus(
        info.bridgeReachable
          ? `متصل — ${info.platform} (RakeenDeviceModule يرد فعليًا)`
          : `غير متصل — لا يوجد رد حقيقي من ${info.nativeModuleName}`,
      );
    })();
  }, []);

  const portNumber = parseInt(port, 10);

  const handleTestPrinter = async () => {
    if (!Printer) {
      setPrinterStatus('🔴 RakeenPrinterModule غير موجود على هذا الجهاز');
      appendLog('Test Printer: NativeModules.RakeenPrinterModule is undefined');
      return;
    }
    appendLog(`Test Printer: connecting to ${host}:${portNumber}...`);
    try {
      const result = await Printer.testConnection({ transport: 'network', host, port: portNumber });
      if (result.reachable) {
        setPrinterStatus(`🟢 متصل (${result.latencyMs?.toFixed(0)}ms)`);
        appendLog(`Test Printer: reachable in ${result.latencyMs?.toFixed(0)}ms`);
      } else {
        setPrinterStatus(`🔴 غير متصل — ${result.error}`);
        appendLog(`Test Printer: unreachable — ${result.error}`);
      }
    } catch (e) {
      setPrinterStatus('🔴 خطأ غير متوقع');
      appendLog(`Test Printer: threw — ${String(e)}`);
    }
  };

  const handlePrintTestReceipt = async () => {
    // printReceipt() (not Printer.print() directly) enforces the "no fake
    // success" rule -- honestly reports PRINTER_UNAVAILABLE if no native
    // module is linked, rather than every call site needing to remember
    // to check `Printer` first.
    appendLog(`Print Test Receipt: sending to ${host}:${portNumber}...`);
    try {
      const result = await printReceipt({
        target: { transport: 'network', host, port: portNumber },
        escPosBase64: buildTestReceiptBase64(),
        timeoutMs: 8000,
      });
      appendLog(
        result.ok
          ? 'Print Test Receipt: ok'
          : `Print Test Receipt: failed — ${result.error}${result.errorDetail ? ` (${result.errorDetail})` : ''}`,
      );
    } catch (e) {
      appendLog(`Print Test Receipt: threw — ${String(e)}`);
    }
  };

  const handleOpenDrawer = async () => {
    // One operationId per logical drawer-open attempt -- a real screen
    // would reuse the same client_order_uuid as the order/payment itself,
    // per docs/react-native-migration's cash-drawer idempotency
    // requirement. A fresh ID each button tap here means each POC tap is
    // treated as its own logical operation (rapid-double-tap dedup is
    // exercised by tapping fast enough to overlap two calls with the
    // SAME id, not by tapping this button twice).
    const operationId = `poc-drawer-${Date.now()}`;
    appendLog(`Open Cash Drawer: sending kick to ${host}:${portNumber}... (operationId=${operationId})`);
    try {
      const result = await openCashDrawer({
        target: { transport: 'network', host, port: portNumber },
        timeoutMs: 8000,
        operationId,
      });
      appendLog(
        result.ok
          ? 'Open Cash Drawer: ok'
          : `Open Cash Drawer: failed — ${result.error}${result.errorDetail ? ` (${result.errorDetail})` : ''}`,
      );
    } catch (e) {
      appendLog(`Open Cash Drawer: threw — ${String(e)}`);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.link}>‹ رجوع</Text>
        </TouchableOpacity>
        <Text style={styles.title}>أدوات اختبار الطابعة/الدرج</Text>
        <Text style={styles.subtitle}>
          يثبت مسار واحد كامل: RN UI → JS → NativeModules → Swift/Kotlin → Socket حقيقي.
          راجع docs/react-native-poc/phase7-poc-screen.md
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Native Bridge</Text>
          <Text style={styles.value}>{bridgeStatus}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Network Status</Text>
          <Text style={styles.value}>
            {network
              ? `${network.type} — ${network.isConnected ? 'متصل' : 'غير متصل'} — internetReachable: ${String(network.isInternetReachable)}`
              : 'جارٍ الفحص...'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Printer Target</Text>
          <TextInput
            style={styles.input}
            placeholderTextColor={colors.muted}
            value={host}
            onChangeText={setHost}
            placeholder="192.168.1.50"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholderTextColor={colors.muted}
            value={port}
            onChangeText={setPort}
            placeholder="9100 (default UI value only, never assumed by the contract)"
            keyboardType="number-pad"
          />
          <Text style={styles.value}>Printer Status: {printerStatus}</Text>
        </View>

        <TouchableOpacity style={styles.button} onPress={handleTestPrinter} activeOpacity={0.8}>
          <Text style={styles.buttonText}>Test Printer</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handlePrintTestReceipt} activeOpacity={0.8}>
          <Text style={styles.buttonText}>Print Test Receipt</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleOpenDrawer} activeOpacity={0.8}>
          <Text style={styles.buttonText}>Open Cash Drawer</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Log</Text>
          {log.length === 0 && <Text style={styles.value}>لا يوجد نشاط بعد.</Text>}
          {log.map((line, i) => (
            <Text key={i} style={styles.logLine}>
              {line}
            </Text>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  scroll: { padding: spacing[4] },
  title: { fontFamily: fonts.sansBold, fontSize: 20, color: colors.text, marginBottom: 4 },
  subtitle: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.muted, marginBottom: spacing[4] },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radii.lg,
    padding: spacing[4],
    marginBottom: spacing[3],
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardTitle: { fontFamily: fonts.sansBold, fontSize: 13, marginBottom: 6, color: colors.text },
  value: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.muted },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.sm,
    backgroundColor: colors.surf1,
    color: colors.text,
    padding: 10,
    marginBottom: spacing[2],
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
  },
  button: {
    backgroundColor: colors.surf1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    padding: spacing[4],
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  buttonText: { fontFamily: fonts.sansBold, color: colors.text },
  logLine: { fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.muted, marginBottom: 2 },
  link: { fontFamily: fonts.sansBold, color: colors.muted, marginBottom: spacing[2] },
  screenArea: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  topBarTitle: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text },
  // .theme-toggle
  themeToggle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surf1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerStatusBanner: { backgroundColor: colors.surf2, paddingVertical: spacing[2], paddingHorizontal: spacing[4] },
  drawerStatusText: { fontFamily: fonts.sansSemiBold, fontSize: 12, textAlign: 'center', color: colors.text },
  // .bottom-nav (rakeen-pos.css:351)
  bottomNav: { height: 68, flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
  // .nav-tab
  navTab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5 },
  navTabLabel: { fontFamily: fonts.sansBold, fontSize: 10.5 },
  moreRoot: { flex: 1, backgroundColor: colors.canvas },
  moreScroll: { padding: spacing[4] },
  moreRow: { backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, padding: spacing[4], marginBottom: spacing[2] },
  moreRowText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.text, textAlign: 'center' },
  moreRowTextDanger: { color: colors.danger },
  moreDivider: { height: spacing[3] },
  }),
);

/**
 * The whole tree has to sit under ThemeProvider for useTheme()/createStyles
 * to resolve, and the provider starts on light -- matching POSPage.tsx's
 * unconditional `data-theme="light"` on mount. See theme.ts's header.
 */
export default function Root(): React.JSX.Element {
  return (
    <ThemeProvider>
      <App />
    </ThemeProvider>
  );
}
