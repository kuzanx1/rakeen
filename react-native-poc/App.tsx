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

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { TouchableOpacity } from './src/ui/tappable';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
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
import { enqueuePrintJob } from './src/application/printService';
import PrintQueueScreen from './src/ui/PrintQueueScreen';
import PrinterSettingsScreen from './src/ui/PrinterSettingsScreen';
import uuid from 'react-native-uuid';
import { getPrinterProfile } from './src/infrastructure/printerProfileStore';
import { getPosFeatureFlags, subscribeToBusinessSettings } from './src/application/catalogService';
import { profileToPrinterTarget, drawerKickCommandFor, isDrawerSupported } from './src/domain/printerProfile';
import { startDiagnosticsTracking } from './src/application/diagnosticsService';
import { getNotifySoundEnabled } from './src/application/catalogService';
import { setNotifySoundEnabled } from './src/application/soundService';
import DiagnosticsScreen from './src/ui/DiagnosticsScreen';
import OrderHistoryScreen from './src/ui/OrderHistoryScreen';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { createStyles, fonts, radii, spacing, ThemeProvider, useTheme } from './src/ui/theme';
import { ShellProvider, TOPBAR_FALLBACK_HEIGHT, useShell } from './src/ui/shell';
import { I18nProvider, useI18n } from './src/ui/i18n';
import Topbar from './src/ui/Topbar';
import ManagerPinModal from './src/ui/ManagerPinModal';
import OpenShiftScreen from './src/ui/OpenShiftScreen';
import StaffPickScreen from './src/ui/StaffPickScreen';
import IncomingOrderModal from './src/ui/IncomingOrderModal';
import {
  listPendingOnlineOrders,
  subscribeToIncomingOnlineOrders,
  getIncomingOrder,
  acceptOnlineOrder,
  rejectOnlineOrder,
} from './src/application/incomingOrderService';
import type { IncomingOrder } from './src/application/incomingOrderService';
import { startIncomingOrderSound, stopIncomingOrderSound } from './src/application/soundService';
import { loadRememberedStaff, rememberStaff } from './src/application/staffService';
import type { StaffMember } from './src/application/staffService';
import { ShiftSummaryModal, CloseShiftModal } from './src/ui/ShiftModals';
import { findOpenShift, getLastClosingReport } from './src/application/shiftService';
import type { Shift } from './src/domain/shift';

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
  const { t } = useI18n();
  const styles = useStyles();
  const { sideBySide, homeActive, orderPanelWidth, topbarHeight, bottomNavHeight } = useShell();
  const setTopbarHeight = useSetTopbarHeight();
  const [cashier, setCashier] = useState<CashierProfile | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'products', table: null });
  const [branchId, setBranchId] = useState<number | null>(null);
  /** #posBusinessName / #posBranchName -- .identity-cluster's two lines,
   *  shown only at >=761px (the phone rule hides .identity-text). */
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [branchName, setBranchName] = useState<string | null>(null);
  /** #connStatus. NetInfo is the same signal diagnosticsService already
   *  listens to; a second listener here keeps the pill live without
   *  coupling the topbar to the Diagnostics screen's snapshot cadence. */
  const [online, setOnline] = useState(true);
  /** #printerStatus. The source shows "بدون طابعة شبكة" until a network
   *  printer is actually configured, then the host it will print to. */
  const [printerLabel, setPrinterLabel] = useState('بدون طابعة شبكة');
  /** POS_HIDE_NOTIF_BELL -- the owner can remove the bell entirely. */
  const [hideNotifBell, setHideNotifBell] = useState(false);
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  /** موافقة مدير -- openPinModal() in the source (rakeen-pos.js:5157). */
  const [managerPinOpen, setManagerPinOpen] = useState(false);

  /** CURRENT_SHIFT. Null means either "no shift open" or "not checked
   *  yet" -- shiftChecked separates them, because showing the open-shift
   *  screen during the check would flash it at a cashier who already has
   *  one running. */
  const [shift, setShift] = useState<Shift | null>(null);
  const [shiftChecked, setShiftChecked] = useState(false);

  /** CURRENT_STAFF_MEMBER. `staffPicked` separates "nobody on duty" from
   *  "not asked yet" -- the source lets a branch with no staff carry on
   *  unnamed, so null is a legitimate ANSWER, not just an empty slot. */
  const [staffMember, setStaffMember] = useState<StaffMember | null>(null);
  const [staffPicked, setStaffPicked] = useState(false);
  /**
   * The incoming online-order queue.
   *
   * FIFO, de-duplicated: a second order arriving while the first is being
   * reviewed waits its turn rather than overwriting it.
   */
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [incomingQueue, setIncomingQueue] = useState<number[]>([]);
  const [incomingOrder, setIncomingOrder] = useState<IncomingOrder | null>(null);
  const [incomingLoading, setIncomingLoading] = useState(false);
  const [incomingBusy, setIncomingBusy] = useState(false);
  const [incomingError, setIncomingError] = useState('');

  const enqueueIncoming = useCallback((orderId: number) => {
    setIncomingQueue(q => (q.includes(orderId) ? q : [...q, orderId]));
  }, []);

  // Boot poll + realtime, together. The subscription only sees orders from
  // the moment it connects, so without the poll every order that arrived
  // while this device was asleep, offline or restarting is lost; without
  // the subscription nothing arrives live. Both, or orders go missing.
  useEffect(() => {
    if (!cashier || branchId == null) return;
    let cancelled = false;
    (async () => {
      const pending = await listPendingOnlineOrders(branchId);
      if (!cancelled) pending.forEach(enqueueIncoming);
    })();
    const unsubscribe = subscribeToIncomingOnlineOrders(branchId, enqueueIncoming);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [cashier, branchId, enqueueIncoming]);

  /**
   * Loads the head of the queue -- but DEFERS while the payment popup is
   * open. The source's reasoning, which is a real trap: both modals sit at
   * the same level, this one deliberately cannot be dismissed, and a
   * checkout already in progress (a loyalty confirmation is even running a
   * two-minute countdown) would be buried underneath with no way back to
   * it. Leaving it queued means it simply shows the moment the popup
   * clears.
   */
  useEffect(() => {
    if (checkoutOpen || incomingOrder || incomingQueue.length === 0) return;
    const orderId = incomingQueue[0];
    let cancelled = false;
    setIncomingLoading(true);
    (async () => {
      const detail = await getIncomingOrder(orderId);
      if (cancelled) return;
      setIncomingLoading(false);
      if (!detail) {
        // Already answered from another device, or gone. Drop it.
        setIncomingQueue(q => q.filter(id => id !== orderId));
        return;
      }
      setIncomingError('');
      setIncomingOrder(detail);
      startIncomingOrderSound();
    })();
    return () => {
      cancelled = true;
    };
  }, [incomingQueue, incomingOrder, checkoutOpen]);

  const finishIncoming = useCallback((orderId: number) => {
    stopIncomingOrderSound();
    setIncomingOrder(null);
    setIncomingBusy(false);
    setIncomingQueue(q => q.filter(id => id !== orderId));
  }, []);

  const handleAcceptIncoming = useCallback(async () => {
    if (!incomingOrder) return;
    const orderId = incomingOrder.id;
    setIncomingBusy(true);
    setIncomingError('');
    const result = await acceptOnlineOrder(orderId);
    if (!result.ok) {
      setIncomingBusy(false);
      setIncomingError(result.error ?? 'تعذر قبول الطلب');
      return;
    }
    // Kitchen ticket FIRST, receipt SECOND, and both unconditionally --
    // NOT gated by the per-device auto-print toggles that govern normal
    // checkout. An accepted online order has to reach the kitchen.
    try {
      const device = await getDeviceConfig();
      const lines = incomingOrder.items.map(it => ({
        qty: it.qty,
        name: it.name,
        lineTotal: it.lineTotal,
        mods: it.mods,
        note: it.note ?? undefined,
      }));
      await enqueuePrintJob('kitchen', {
        orderId,
        tableNumber: null,
        lines,
        branchName: device.branchName ?? undefined,
        createdAtISO: new Date().toISOString(),
        metaLabel: 'طلب إلكتروني',
      });
      await enqueuePrintJob('receipt', {
        orderId,
        lines,
        subtotal: incomingOrder.total,
        discount: 0,
        vat: 0,
        total: incomingOrder.total,
        paymentMethod: incomingOrder.paymentMethod,
        change: 0,
        businessName: device.businessName ?? undefined,
        branchName: device.branchName ?? undefined,
        createdAtISO: new Date().toISOString(),
        metaLabel: 'طلب إلكتروني',
      });
    } catch {
      // The order is accepted either way; a print failure is the queue's
      // problem to retry, not a reason to leave the customer unanswered.
    }
    setStatusMessage(`تم قبول الطلب #${orderId}`);
    finishIncoming(orderId);
  }, [incomingOrder, finishIncoming]);

  const handleRejectIncoming = useCallback(
    async (reason: string) => {
      if (!incomingOrder) return;
      const orderId = incomingOrder.id;
      setIncomingBusy(true);
      setIncomingError('');
      const result = await rejectOnlineOrder(orderId, reason);
      if (!result.ok) {
        setIncomingBusy(false);
        setIncomingError(result.error ?? 'تعذر رفض الطلب');
        return;
      }
      setStatusMessage(`تم رفض الطلب #${orderId}`);
      finishIncoming(orderId);
    },
    [incomingOrder, finishIncoming],
  );

  const [shiftSummaryOpen, setShiftSummaryOpen] = useState(false);
  const [closeShiftOpen, setCloseShiftOpen] = useState(false);

  /**
   * reprintLastClosingReport() (rakeen-pos.js:5445). No manager approval:
   * the source's own reasoning is that this re-outputs data already
   * produced and approved, rather than creating anything new.
   */
  const handleReprintLastClosing = useCallback(async () => {
    if (branchId == null) return;
    setStatusMessage('جاري البحث عن آخر موازنة...');
    const report = await getLastClosingReport(branchId, businessName ?? '', branchName ?? '');
    if (!report) {
      setStatusMessage('ما فيه موازنة سابقة مسجلة لهذا الفرع');
      return;
    }
    await enqueuePrintJob('shiftReport', report as unknown as Record<string, unknown>);
    setStatusMessage('تم إرسال آخر موازنة للطابعة');
  }, [branchId, businessName, branchName]);

  useEffect(() => {
    if (!cashier) return;
    (async () => {
      const device = await getDeviceConfig();
      setBranchId(device.branchId);
      setBusinessName(device.businessName);
      if (device.businessId != null) {
        try {
          setHideNotifBell((await getPosFeatureFlags(device.businessId)).hideNotifBell);
        } catch {
          // Leave the bell visible; a failed settings read must not remove
          // a control the owner may well want.
        }
      }
      setBranchName(device.branchName);
      try {
        const printer = await getPrinterProfile();
        setPrinterLabel(
          printer?.transport === 'network' && printer.host
            ? `${printer.host}${printer.port ? `:${printer.port}` : ''}`
            : 'بدون طابعة شبكة',
        );
      } catch {
        // an unreadable profile is indistinguishable from an unset one
        // as far as this label is concerned
      }
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
  /**
   * afterStaffReady() (rakeen-pos.js:6277): look for an open shift, and
   * only boot the till if there is one. Otherwise the open-shift screen
   * stands in front of it -- a cashier cannot start selling without first
   * declaring what is in the drawer, which is the whole basis for the
   * closing count.
   */
  /** applyStaffMember()'s persisted pick (rakeen-pos.js:6204). Restored
   *  before the picker is shown so a device restart does not force a
   *  re-pick of who is on duty. */
  useEffect(() => {
    if (!cashier) {
      setStaffMember(null);
      setStaffPicked(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const remembered = await loadRememberedStaff();
      if (cancelled) return;
      if (remembered) {
        setStaffMember(remembered);
        setStaffPicked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cashier]);

  useEffect(() => {
    if (!cashier) {
      setShift(null);
      setShiftChecked(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const open = await findOpenShift(cashier.id);
      if (cancelled) return;
      setShift(open);
      setShiftChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [cashier]);

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

  // #connStatus's own live source.
  useEffect(
    () => NetInfo.addEventListener(st => setOnline(!!st.isConnected)),
    [],
  );

  // The bell flag lives up here rather than in ProductsScreen, so it needs
  // its own re-read when the owner changes it.
  useEffect(() => {
    if (cashier == null) return;
    return subscribeToBusinessSettings(cashier.business_id, async () => {
      try {
        setHideNotifBell((await getPosFeatureFlags(cashier.business_id)).hideNotifBell);
      } catch {
        // Keep whatever is showing rather than removing a control on a
        // failed read.
      }
    });
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
    setStatusMessage('');
    try {
      const profile = await getPrinterProfile();
      if (!isDrawerSupported(profile)) {
        setStatusMessage('ما فيه درج مربوط — اضبطه من إعدادات الطباعة');
        return;
      }
      const target = profileToPrinterTarget(profile);
      if (!target) {
        setStatusMessage('إعدادات الدرج ناقصة — راجعها من إعدادات الطباعة');
        return;
      }
      const result = await openCashDrawer({
        target,
        kickCommandBase64: drawerKickCommandFor(profile),
        timeoutMs: 8000,
        operationId: `manual-${uuid.v4()}`,
      });
      if (result.ok) {
        setStatusMessage('تم فتح الدرج');
      } else if (result.error === 'CASH_DRAWER_UNAVAILABLE') {
        setStatusMessage('هذا الجهاز ما يدعم فتح الدرج');
      } else {
        setStatusMessage('تعذّر فتح الدرج — تأكد أن الطابعة موصولة وشغّالة');
      }
    } catch (e) {
      setStatusMessage('تعذّر فتح الدرج — جرّب مرة ثانية');
    } finally {
      setDrawerBusy(false);
    }
  };

  const activeTab = screenToTab(screen);

  // `.app.home-active` is what narrows the two bars, so the shell has to
  // know which tab is showing.
  //
  // These two hooks MUST stay above the conditional returns below. They
  // used to sit under them, which meant the login render ran N hooks and
  // the first render after a successful login ran N+2 -- React throws
  // "Rendered more hooks than during the previous render", and with no
  // error boundary anywhere in this app a release build just closes.
  // That is exactly the crash reported right after entering the branch
  // code: the login screen itself was fine, the very next render was not.
  const setHomeActive = React.useContext(HomeActiveContext);
  useEffect(() => {
    setHomeActive(activeTab === 'home');
  }, [activeTab, setHomeActive]);
  // Same rule -- this one belongs to .bottom-nav below, not to anything
  // above the returns, but it is a hook so it lives up here regardless.
  const insets = useSafeAreaInsets();

  if (!cashier) {
    return <LoginScreen onLoggedIn={setCashier} />;
  }

  // afterStaffReady() (rakeen-pos.js:6206) runs the shift check only AFTER
  // a name is chosen -- the branch PIN is a shared account, so this is the
  // one moment the app learns who is actually on the till.
  if (branchId != null && !staffPicked) {
    return (
      <StaffPickScreen
        branchId={branchId}
        onPicked={member => {
          setStaffMember(member);
          setStaffPicked(true);
        }}
      />
    );
  }

  // branchId comes from the device config effect, so "not loaded yet" and
  // "genuinely unpaired" both read as null here; waiting for the shift
  // check AND the config keeps the open-shift screen from being skipped
  // on the first frame.
  if (!shiftChecked || branchId == null) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accentText} />
      </View>
    );
  }

  if (!shift && branchId != null) {
    return (
      <OpenShiftScreen
        // shifts.staff_member_id exists and the source fills it; without
        // it a shift report cannot name who was on duty.
        staffMemberId={staffMember?.id ?? null}
        businessId={cashier.business_id}
        // DEVICE.branchId, not the profile's. The shift belongs to the
        // till this device is paired to; a cashier's own profile branch
        // can differ (or be null) and would file the shift against the
        // wrong branch -- or, being null, silently skip this screen and
        // let every order be sold against no shift at all.
        branchId={branchId}
        cashierId={cashier.id}
        onOpened={setShift}
      />
    );
  }

  return (
    /* Every edge EXCEPT the bottom. The source does not inset the page for
       the home indicator either -- it stretches .bottom-nav over that strip
       (`height: calc(68px + env(safe-area-inset-bottom)); padding-bottom:
       env(safe-area-inset-bottom)`, rakeen-pos-additions.css:457-461) so the
       nav's own background reaches the true bottom edge. Insetting the ROOT
       instead, which is all react-native's own SafeAreaView can do, left the
       nav floating above a 34pt band of bare canvas -- visible as an empty
       strip under the tabs on any device with a home indicator. */
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* At >=761px both bars leave normal flow (position:absolute) so the
          screen area spans the full height behind them and .order-panel
          can reach the true top and bottom edges; on Home they also stop
          short by the panel's width. Below that they are ordinary
          siblings, exactly as the source has them. */}
      <Topbar
        style={sideBySide ? [styles.barAbsolute, { top: 0, end: homeActive ? orderPanelWidth : 0 }] : undefined}
        onLayout={setTopbarHeight}
        businessName={businessName}
        branchName={branchName}
        online={online}
        printerLabel={printerLabel}
        hideNotifBell={hideNotifBell}
        unreadNotifications={false}
        // notifBellBtn's whole handler (rakeen-pos.js:4933) is a jump to
        // the Orders screen. It was rendered here with no handler at all,
        // so tapping it did nothing.
        onPressBell={() => setScreen({ name: 'orderHistory' })}
        onSwitchStaff={async () => {
          // posSwitchStaffBtn -- swap who is on duty WITHOUT unpairing the
          // device or ending the shift. Now that the picker exists this is
          // exactly a return to it.
          await rememberStaff(null);
          setStaffMember(null);
          setStaffPicked(false);
        }}
        onLogout={async () => {
          await logout();
          setCashier(null);
        }}
      />
      {/* RN-only chrome (the PWA surfaces this through showToast()). Once
          the screen area is absolutely positioned it would paint over a
          normal-flow banner, so at >=761px this floats just under the
          topbar on the same layer as the bars instead. */}
      {/* موافقة مدير -- openPinModal() with no callback (rakeen-pos.js:5557)
          is a standalone supervisor check: it verifies the manager's code
          and reports "تمت موافقة المدير", with nothing else attached. */}
      <IncomingOrderModal
        order={incomingOrder}
        loading={incomingLoading}
        busy={incomingBusy}
        error={incomingError}
        onAccept={handleAcceptIncoming}
        onReject={handleRejectIncoming}
      />

      <ShiftSummaryModal visible={shiftSummaryOpen} shift={shift} onClose={() => setShiftSummaryOpen(false)} />

      <CloseShiftModal
        visible={closeShiftOpen}
        shift={shift}
        businessName={businessName ?? ''}
        branchName={branchName ?? ''}
        // The staff member on duty, not the shared PIN account's own
        // profile name -- that is the same string for everyone on the till.
        staffName={staffMember?.name ?? ''}
        onClose={() => setCloseShiftOpen(false)}
        onClosed={async (report, warning) => {
          setCloseShiftOpen(false);
          if (warning) setStatusMessage(warning);
          // Queued like any other job so a jammed printer retries rather
          // than losing the slip -- which is the whole reason the source
          // keeps a reprint around.
          await enqueuePrintJob('shiftReport', report as unknown as Record<string, unknown>);
          // The source signs the cashier out and reloads: a closed shift
          // must not leave a till that can still take orders against it.
          setShift(null);
          await logout();
          setCashier(null);
        }}
      />

      <ManagerPinModal
        visible={managerPinOpen}
        onApprove={() => {
          setManagerPinOpen(false);
          setStatusMessage('تمت موافقة المدير');
        }}
        onCancel={() => setManagerPinOpen(false)}
      />

      {!!statusMessage && (
        <View
          style={[
            styles.statusBanner,
            sideBySide && {
              position: 'absolute',
              top: topbarHeight,
              start: 0,
              end: homeActive ? orderPanelWidth : 0,
              zIndex: 3,
            },
          ]}>
          <Text style={styles.statusBannerText}>{statusMessage}</Text>
        </View>
      )}
      <View style={[styles.screenArea, sideBySide && styles.screenAreaBehindBars]}>
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
            onOpenDrawer={handleOpenDrawerManually}
            // Both tiles land on the same place for the same reason the
            // source does it: the cashier has to pick WHICH order first.
            onOpenCompletedOrders={() => setScreen({ name: 'orderHistory' })}
            onRequestManagerApproval={() => setManagerPinOpen(true)}
            onOpenShiftSummary={() => setShiftSummaryOpen(true)}
            onCloseShift={() => {
              if (!shift) {
                setStatusMessage('ما فيه وردية مفتوحة');
                return;
              }
              setCloseShiftOpen(true);
            }}
            onReprintLastClosing={handleReprintLastClosing}
            drawerBusy={drawerBusy}
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
            shift={shift}
            staffMember={staffMember}
            onCheckoutOpenChange={setCheckoutOpen}
            selectedTable={screen.name === 'products' ? screen.table : null}
            onExitTableContext={() => setScreen({ name: 'tables' })}
          />
        )}
      </View>

      {/* .bottom-nav / .nav-tab (rakeen-pos.css:351-354) -- same 4 tabs,
          same SVG icon paths, same active-color rule as pos-markup.ts. */}
      <View
        style={[
          styles.bottomNav,
          { height: bottomNavHeight, paddingBottom: insets.bottom },
          sideBySide && [styles.barAbsolute, { bottom: 0, end: homeActive ? orderPanelWidth : 0 }],
        ]}>
        <NavTabButton
          active={activeTab === 'home'}
          label={t('الرئيسية')}
          onPress={() => setScreen({ name: 'products', table: null })}
          icon={<Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />}
        />
        <NavTabButton
          active={activeTab === 'orders'}
          label={t('الطلبات')}
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
          label={t('الطاولات')}
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
          label={t('المزيد')}
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
/**
 * #screen-more (pos-markup.ts). Two LABELLED SECTIONS of icon tiles, not a
 * list of text rows:
 *
 *   "إجراءات سريعة — وقت الخدمة"   QUICK_ACTIONS  (rakeen-pos.js:5136)
 *   "الوردية"                        SHIFT_ACTIONS  (:5144)
 *
 * .more-grid is `repeat(auto-fill, minmax(154px,1fr))` with a 12px gap, and
 * each .more-item is a centred column: a 24px lime glyph over a 12.5/700
 * label, on surf1 with a hairline border and the large radius.
 *
 * This screen was a stack of full-width text rows with no icons and no
 * sections at all.
 *
 * One of the source's ten tiles is still not rendered: مسح باركود needs
 * the camera. A tile that looks live and does nothing when a cashier taps
 * it mid-service is worse than one that is not there yet.
 */
function MoreScreen({
  onOpenPrintQueue,
  onOpenPrinterSettings,
  onOpenDiagnostics,
  onOpenDrawer,
  onOpenCompletedOrders,
  onRequestManagerApproval,
  onOpenShiftSummary,
  onCloseShift,
  onReprintLastClosing,
  drawerBusy,
}: {
  onOpenPrintQueue: () => void;
  onOpenPrinterSettings: () => void;
  onOpenDiagnostics: () => void;
  onOpenDrawer: () => void;
  /** إعادة طباعة and استرجاع مبلغ both just send the cashier to
   *  the completed-orders list to pick the order (rakeen-pos.js:5158). */
  onOpenCompletedOrders: (purpose: 'reprint' | 'refund') => void;
  onRequestManagerApproval: () => void;
  onOpenShiftSummary: () => void;
  onCloseShift: () => void;
  onReprintLastClosing: () => void;
  drawerBusy: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { sideBySide, insetTop, insetBottom } = useShell();
  // .more-scroll -- `padding:18px 24px 28px`, plus the bar clearances at
  // >=761px where both bars are out of normal flow.
  const inset = sideBySide ? { paddingTop: insetTop + 18, paddingBottom: 28 + insetBottom } : null;

  const ink = colors.accentText;
  return (
    <ScrollView style={styles.moreRoot} contentContainerStyle={[styles.moreScroll, inset]}>
      <Text style={[styles.moreSectionLabel, styles.moreSectionLabelFirst]}>إجراءات سريعة — وقت الخدمة</Text>
      <View style={styles.moreGrid}>
        <MoreTile label={drawerBusy ? 'جارٍ الفتح...' : 'فتح الدرج'} onPress={onOpenDrawer} disabled={drawerBusy}>
          <Rect x={2} y={7} width={20} height={14} rx={2} stroke={ink} />
          <Path d="M2 7l4-4h12l4 4" stroke={ink} />
          <Line x1={12} y1={12} x2={12} y2={16} stroke={ink} />
        </MoreTile>
        <MoreTile label="استرجاع مبلغ" onPress={() => onOpenCompletedOrders('refund')}>
          <Polyline points="9 14 4 9 9 4" stroke={ink} />
          <Path d="M20 20v-7a4 4 0 0 0-4-4H4" stroke={ink} />
        </MoreTile>
        <MoreTile label="موافقة مدير" onPress={onRequestManagerApproval}>
          <Rect x={3} y={11} width={18} height={11} rx={2} stroke={ink} />
          <Path d="M7 11V7a5 5 0 0 1 10 0v4" stroke={ink} />
        </MoreTile>
        <MoreTile label="إعادة طباعة" onPress={() => onOpenCompletedOrders('reprint')}>
          <Polyline points="6 9 6 2 18 2 18 9" stroke={ink} />
          <Path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" stroke={ink} />
          <Rect x={6} y={14} width={12} height={8} stroke={ink} />
        </MoreTile>
      </View>

      <Text style={styles.moreSectionLabel}>الوردية</Text>
      <View style={styles.moreGrid}>
        <MoreTile label="ملخص الوردية" onPress={onOpenShiftSummary}>
          <Path d="M3 3v18h18" stroke={ink} />
          <Path d="M18 17V9M13 17V5M8 17v-3" stroke={ink} />
        </MoreTile>
        <MoreTile label="إغلاق الوردية" onPress={onCloseShift}>
          <Circle cx={12} cy={12} r={10} stroke={ink} />
          <Polyline points="12 6 12 12 16 14" stroke={ink} />
        </MoreTile>
        <MoreTile label="طباعة آخر موازنة" onPress={onReprintLastClosing}>
          <Polyline points="6 9 6 2 18 2 18 9" stroke={ink} />
          <Path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" stroke={ink} />
          <Rect x={6} y={14} width={12} height={8} stroke={ink} />
        </MoreTile>
        <MoreTile label="إعدادات الطباعة" onPress={onOpenPrinterSettings}>
          <Circle cx={12} cy={12} r={3} stroke={ink} />
          <Path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            stroke={ink}
          />
        </MoreTile>
        {/* Not one of the source's ten. Kept because the queue screen is
            real and this is its only way in -- the PWA surfaces the same
            information on the receipt screen instead. */}
        <MoreTile label="قائمة الطباعة" onPress={onOpenPrintQueue}>
          <Polyline points="6 9 6 2 18 2 18 9" stroke={ink} />
          <Path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" stroke={ink} />
          <Rect x={6} y={14} width={12} height={8} stroke={ink} />
        </MoreTile>
        <MoreTile label="تشخيص النظام" onPress={onOpenDiagnostics}>
          <Path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke={ink} />
        </MoreTile>
      </View>
    </ScrollView>
  );
}

/** .more-item -- `padding:22px 14px; border-radius:var(--r-lg);
 *  background:var(--surf1); border:1px solid var(--line)`, a centred
 *  column with an 11px gap, a 24px glyph and a 12.5/700 label. */
function MoreTile({
  label,
  onPress,
  disabled,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  return (
    <TouchableOpacity
      style={[styles.moreItem, disabled && styles.moreItemDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}>
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </Svg>
      <Text style={styles.moreItemText}>{label}</Text>
    </TouchableOpacity>
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
  link: { fontFamily: fonts.sansBold, color: colors.muted },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing[2] },
  screenArea: { flex: 1 },
  // `.screens` spanning the full height behind both bars at >=761px
  screenAreaBehindBars: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  // shared by .topbar and .bottom-nav once they leave normal flow
  barAbsolute: { position: 'absolute', start: 0, zIndex: 2 },
  statusBanner: { backgroundColor: colors.surf2, paddingVertical: spacing[2], paddingHorizontal: spacing[4] },
  statusBannerText: { fontFamily: fonts.sansSemiBold, fontSize: 12, textAlign: 'center', color: colors.text },
  // .bottom-nav (rakeen-pos.css:351)
  bottomNav: { height: 68, flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
  // .nav-tab
  navTab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5 },
  navTabLabel: { fontFamily: fonts.sansBold, fontSize: 10.5 },
  moreRoot: { flex: 1, backgroundColor: colors.canvas },
  // .more-scroll -- `padding:18px 24px 28px`
  center: { alignItems: 'center', justifyContent: 'center' },
  moreScroll: { paddingTop: 18, paddingHorizontal: 24, paddingBottom: 28 },
  // .more-section-label
  moreSectionLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 0.44,
    marginTop: 20,
    marginBottom: 12,
  },
  // .more-section-label:first-child
  moreSectionLabelFirst: { marginTop: 0 },
  /* .more-grid is `repeat(auto-fill, minmax(154px,1fr))` with gap 12. RN
     has no auto-fill, so this wraps instead and each tile takes a minimum
     of 154 while still growing to share the row -- the same result at
     every width the app actually runs at. */
  moreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  // .more-item
  moreItem: {
    flexGrow: 1,
    flexBasis: 154,
    paddingVertical: 22,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.surf1,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    gap: 11,
  },
  moreItemDisabled: { opacity: 0.5 },
  // .more-item span
  moreItemText: { fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.text, textAlign: 'center' },
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
/**
 * Lets App report its measured topbar height back up to the provider that
 * feeds it to every screen -- the equivalent of the source's
 * ResizeObserver writing --topbar-h. Kept as its own tiny context so App
 * doesn't have to be split in two just to sit under ShellProvider.
 */
const SetTopbarHeightContext = React.createContext<(h: number) => void>(() => {});
function useSetTopbarHeight() {
  return React.useContext(SetTopbarHeightContext);
}

function Shell(): React.JSX.Element {
  const [topbarHeight, setTopbarHeight] = useState(TOPBAR_FALLBACK_HEIGHT);
  const [homeActive, setHomeActive] = useState(true);
  return (
    <HomeActiveContext.Provider value={setHomeActive}>
      <SetTopbarHeightContext.Provider value={setTopbarHeight}>
        <ShellProvider homeActive={homeActive} topbarHeight={topbarHeight}>
          <I18nProvider>
            <App />
          </I18nProvider>
        </ShellProvider>
      </SetTopbarHeightContext.Provider>
    </HomeActiveContext.Provider>
  );
}

/** `.app.home-active` -- only Home reserves the order-panel column. */
const HomeActiveContext = React.createContext<(active: boolean) => void>(() => {});

export default function Root(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
