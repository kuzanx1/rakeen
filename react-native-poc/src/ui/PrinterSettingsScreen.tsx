import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './Text';
import { TouchableOpacity } from './tappable';
import GradientFill from './GradientFill';
import { getPrinterProfile, savePrinterProfile } from '../infrastructure/printerProfileStore';
import { getDeviceConfig } from '../application/authService';
import { getReceiptBusinessProfile, getReceiptTheme } from '../application/catalogService';
import { enqueuePrintJob, listPrintJobs, processPrintQueueNow } from '../application/printService';
import { receiptTheme } from '../domain/receiptTheme';
import type { DeviceConfig } from '../domain/auth';
import { Printer, printReceipt } from '../platform/printer';
import { buildArabicProbeSlip, bytesToBase64 } from '../domain/escposText';
import {
  validatePrinterProfile,
  emptyPrinterProfile,
  PAPER_WIDTH_PRESETS,
  SUPPORTED_TRANSPORTS,
  profileToPrinterTarget,
} from '../domain/printerProfile';
import type { PrinterProfile, PrinterTransportKind, DiscoveredDevice, PrinterTarget } from '../platform/printer';
import { createStyles, fonts, gradients, radii, spacing, useTheme } from './theme';

const TRANSPORT_LABELS: Record<PrinterTransportKind, string> = {
  network: 'شبكة الواي فاي',
  bluetooth: 'بلوتوث',
  usb: 'سلك USB',
};

/** The same labels for the sentence that names where printing actually
 *  goes -- so a cashier is never shown the internal word 'network'. */
const TRANSPORT_SENTENCE: Record<PrinterTransportKind, string> = {
  network: 'الشبكة',
  bluetooth: 'البلوتوث',
  usb: 'السلك',
};

const SCAN_TIMEOUT_MS = 6000;

/**
 * Checkpoint 11 (Printer Configuration + Hardware Abstraction) -- the
 * real Settings flow requirement 1 asks for. Every field maps directly
 * to platform/printer.ts's own PrinterProfile/PrinterCapabilities/
 * DrawerCapabilities (Checkpoint 1's contract) -- no new shape invented.
 * Brand/model are free text (requirement 4: never assume Sunmi NT310 or
 * any specific hardware); port has no default (requirement 5: never
 * assume 9100); transport picker only lets 'network' actually be
 * selected -- bluetooth/usb are shown, labeled unsupported, and
 * disabled, per requirement 13 (never pretend they work).
 *
 * Visuals: text fields reuse .pos-auth-field's input styling, toggles
 * reuse .pos-check's checkbox look (rakeen-pos-additions.css) instead of
 * an OS Switch, and "حفظ الإعدادات" reuses the .pay-btn gradient. No
 * dedicated PWA "settings section card" class exists (this screen lives
 * outside the reference CSS this app was audited against) -- section
 * cards use the same card-bg/line/radii tokens as everything else.
 */
/**
 * ما الذي تستعمله الطباعة فعلاً الآن — بالمنفذ.
 *
 * كان يُطبع العنوان وحده، فتغييرُ المنفذ وحده يجعل التحذير يعرض نصاً
 * مطابقاً لما يكتبه المالك في النموذج: "لسه يستخدمان 192.168.8.163"
 * بينما هو غيّر 9001 إلى 9100. التحذير الذي لا يُظهر ما اختلف يُقرأ
 * تأكيداً لا تحذيراً — وهذا ما حصل في تجربة حية.
 */
function describeSavedTarget(t: PrinterTarget): string {
  if (t.transport !== 'network') return TRANSPORT_SENTENCE[t.transport];
  return t.port ? `${t.host}:${t.port}` : t.host || '';
}

/**
 * السبب الحقيقي بدل جملة واحدة لكل الأعطال.
 *
 * الطبقة الأصلية تميّز الأسباب بدقة (NetworkPrinterTransport.describeError)
 * والواجهة كانت ترميها وتقول "تأكد إنها مشغّلة وعلى نفس شبكة الواي فاي"
 * حتى حين تكون الطابعة قد ردّت بالفعل ورفضت المنفذ. كل جملة هنا تنتهي
 * بالإجراء الذي يخصّ سببها، لا بفحص عام.
 */
function failureSentence(detail?: string): string {
  switch (detail) {
    case 'connection_refused':
      return 'الطابعة ردّت لكن رفضت هذا المنفذ — الرقم غلط. المعتاد 9100، والرقم الصحيح مكتوب في تقرير الشبكة اللي تطبعه الطابعة نفسها.';
    case 'permission_denied_local_network':
      return 'النظام مانع التطبيق من الشبكة المحلية — من إعدادات الجهاز: ركين ← فعّل «الشبكة المحلية».';
    case 'host_unreachable':
      return 'العنوان مو على شبكتك — تأكد إن الجهاز والطابعة على نفس الراوتر.';
    case 'connection_timeout':
      return 'ما رد أحد على هذا العنوان — تأكد إن الطابعة مشغّلة وموصولة، وإن ما فيه تطبيق ثاني ماسك الطابعة.';
    case 'invalid_port':
      return 'رقم المنفذ غير صالح.';
    default:
      return 'ما قدرنا نوصل للطابعة — تأكد إنها مشغّلة وعلى نفس الشبكة.';
  }
}

export default function PrinterSettingsScreen({
  online,
  staffName,
}: {
  /** The connection pill the PWA settings modal shows beside the branch. */
  online: boolean;
  /** The staff member currently on the till, not the paired device account. */
  staffName: string | null;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [profile, setProfile] = useState<PrinterProfile>(emptyPrinterProfile());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');
  /** The native transport's trace for the probe -- the endpoint iOS
   *  actually bound and the interface it used. A latency in the seconds
   *  on a same-subnet LAN is not a normal TCP handshake, and this is
   *  what says where it really went. */
  const [testTrace, setTestTrace] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ devices: DiscoveredDevice[]; error?: string } | null>(null);
  /**
   * What is actually PERSISTED, kept beside the editable form.
   *
   * "اختبار الاتصال" probes the target derived from the form -- i.e. the
   * values on screen right now. Every real print job and every cash-drawer
   * kick instead reads the SAVED profile (printService.doDispatch ->
   * getPrinterProfile()). Those are the same thing only after a
   * successful save, so a green test result proves nothing about where a
   * receipt will actually go while an edit is still unsaved. Showing the
   * difference is the only way that stays visible to the cashier.
   */
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);

  /** The context block the PWA prints above the printer fields: which
   *  business and branch this till is paired to, who is on it, and
   *  whether it can currently reach the server. A cashier phoning for
   *  help is asked all four, and without them the answer is a guess. */
  const [device, setDevice] = useState<DeviceConfig | null>(null);
  const [themeId, setThemeId] = useState<string>('classic');
  const [printingTest, setPrintingTest] = useState(false);
  const [probing, setProbing] = useState(false);
  const [textProbeStatus, setTextProbeStatus] = useState('');
  const [testPrintStatus, setTestPrintStatus] = useState('');
  /** The cash-drawer command is a field nobody fills in by hand; it is
   *  here for a printer whose kick sequence differs from the standard
   *  one. Collapsed so it is not the fifth thing a cashier reads. */
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const existing = await getPrinterProfile();
      if (existing) setProfile(existing);
      setSavedSnapshot(existing ? JSON.stringify(existing) : null);
      const cfg = await getDeviceConfig();
      setDevice(cfg);
      if (cfg.businessId != null) setThemeId(await getReceiptTheme(cfg.businessId));
      setLoading(false);
    })();
  }, []);

  const validation = validatePrinterProfile(profile);
  const savedTarget = savedSnapshot
    ? profileToPrinterTarget(JSON.parse(savedSnapshot) as PrinterProfile)
    : null;
  const unsaved = savedSnapshot !== JSON.stringify(profile);

  const update = (patch: Partial<PrinterProfile>) => setProfile(prev => ({ ...prev, ...patch }));
  const updateDrawer = (patch: Partial<PrinterProfile['drawerCapabilities']>) =>
    setProfile(prev => ({ ...prev, drawerCapabilities: { ...prev.drawerCapabilities, ...patch } }));
  const updateCapabilities = (patch: Partial<PrinterProfile['capabilities']>) =>
    setProfile(prev => ({ ...prev, capabilities: { ...prev.capabilities, ...patch } }));

  /** Feature Parity Pass -- Bluetooth/USB. Real device discovery -- never
   *  a text field for typing a MAC/UUID/device id, so a profile can only
   *  ever point at a device this scan actually found. */
  const handleScanDevices = async (transport: 'bluetooth' | 'usb') => {
    setScanning(true);
    setScanResult(null);
    try {
      if (!Printer) {
        setScanResult({ devices: [], error: 'الطباعة غير متاحة على هذا الجهاز' });
        return;
      }
      const result = await Printer.scanDevices(transport, SCAN_TIMEOUT_MS);
      setScanResult(result);
    } catch (e) {
      setScanResult({ devices: [], error: String(e) });
    } finally {
      setScanning(false);
    }
  };

  const selectDevice = (transport: 'bluetooth' | 'usb', device: DiscoveredDevice) => {
    if (transport === 'bluetooth') {
      update({ bluetoothId: device.id, bluetoothName: device.name ?? undefined });
    } else {
      update({ usbAccessoryId: device.id, usbAccessoryName: device.name ?? undefined });
    }
    setScanResult(null);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult('');
    setTestTrace([]);
    try {
      if (!Printer) {
        setTestResult('🔴 الطباعة غير متاحة على هذا الجهاز');
        return;
      }
      const target = profileToPrinterTarget(profile);
      if (!target) {
        setTestResult('🔴 أكمل إعدادات الطابعة فوق أولًا');
        return;
      }
      const result = await Printer.testConnection(target);
      setTestTrace(result.diagnostics ?? []);
      const where = target.transport === 'network' ? target.host : TRANSPORT_SENTENCE[target.transport];
      // Reaching the printer is not the same as printing on it -- a
      // printer that answers with an empty paper roll passes this and
      // produces nothing. Saying so keeps "اختبار الاتصال" from being
      // read as "الطباعة شغالة".
      setTestResult(
        result.reachable
          ? `🟢 وصلنا للطابعة (${where}) — للتأكد إنها تطبع فعلًا اضغط «طباعة اختبار».`
          : `🔴 ${failureSentence(result.errorDetail)} (${where})`,
      );
    } catch (e) {
      setTestResult('🔴 خطأ غير متوقع — جرّب مرة ثانية');
    } finally {
      setTesting(false);
    }
  };

  /**
   * A real receipt, through the real queue.
   *
   * Deliberately NOT a shortcut straight to the transport: it goes
   * through enqueuePrintJob -> processPrintQueueNow, the exact path a
   * paid order takes. A test that used a private path could pass while
   * every real receipt still failed, which is the one thing a test
   * print exists to rule out.
   *
   * It uses the SAVED profile, like every real job does -- so it is
   * refused outright while there are unsaved edits, rather than quietly
   * testing a target the cashier is no longer looking at.
   */
  /**
   * يطبع ورقة نصية صغيرة ويوقّتها.
   *
   * الغرض ليس فاتورة، بل جواب: هل ترسم هذي الطابعة العربية من نص
   * UTF-8، وهل تصل حروفها، وهل ترتّبها من اليمين؟ وكم تأخذ؟ الوقت
   * المعروض هنا يُقارَن مباشرةً بوقت فاتورة الاختبار فوقه — ولو طبعت
   * الورقة في جزء من الثانية بينما الفاتورة تأخذ ٤٥، فقد ثبت أن الحل
   * في النص لا في الصورة.
   */
  const handleTextProbe = async () => {
    if (unsaved) {
      setTextProbeStatus('احفظ الإعدادات أولًا.');
      return;
    }
    const target = savedTarget;
    if (!target) {
      setTextProbeStatus('ما فيه طابعة محفوظة.');
      return;
    }
    setProbing(true);
    setTextProbeStatus('');
    const startedAt = Date.now();
    try {
      const result = await printReceipt({
        target,
        escPosBase64: bytesToBase64(buildArabicProbeSlip()),
        timeoutMs: 15000,
      });
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      setTextProbeStatus(
        result.ok
          ? `🟢 انطبعت في ${seconds} ثانية — شوف الورقة: هل العربي متصل ويُقرأ من اليمين؟`
          : `🔴 ما انطبعت (${result.errorDetail ?? 'خطأ'})`,
      );
      setTestTrace(result.diagnostics ?? []);
    } catch (e) {
      setTextProbeStatus('🔴 خطأ غير متوقع');
    } finally {
      setProbing(false);
    }
  };

  const handleTestPrint = async () => {
    if (unsaved) {
      setTestPrintStatus('احفظ الإعدادات أولًا — الطباعة تستخدم الإعداد المحفوظ.');
      return;
    }
    setPrintingTest(true);
    setTestPrintStatus('');
    try {
      const profileInfo = device?.businessId != null ? await getReceiptBusinessProfile(device.businessId) : null;
      const jobId = await enqueuePrintJob('receipt', {
        orderId: null,
        lines: [{ name: 'صنف تجريبي', qty: 1, unitPrice: 10, lineTotal: 10, mods: [] }],
        subtotal: 10,
        discount: 0,
        vat: 1.5,
        total: 11.5,
        paymentMethod: 'اختبار',
        change: 0,
        businessName: device?.businessName ?? undefined,
        branchName: device?.branchName ?? undefined,
        vatNumber: profileInfo?.vatNumber || undefined,
        logoUrl: profile.printReceiptLogo !== false ? profileInfo?.logoUrl || undefined : undefined,
        customMessage: profileInfo?.customMessage || undefined,
        createdAtISO: new Date().toISOString(),
        metaLabel: 'طباعة اختبار',
      });
      await processPrintQueueNow();
      // The outcome flags (anySucceeded/anyFailed) describe the whole
      // pass, so an unrelated job queued behind a real order could set
      // either one. Reading THIS job's own final status is the only
      // answer that is actually about the test print.
      const job = (await listPrintJobs()).find(j => j.id === jobId);
      if (job?.status === 'printed') {
        setTestPrintStatus('🟢 طلعت فاتورة الاختبار — الطابعة جاهزة.');
      } else if (job?.status === 'skipped_no_printer') {
        setTestPrintStatus('🔴 ما فيه طابعة محفوظة — أكمل الإعدادات فوق واحفظها.');
      } else if (job?.status === 'failed') {
        setTestPrintStatus('🔴 ما طلعت الفاتورة — تأكد إن الطابعة شغالة وفيها ورق وعلى نفس الشبكة.');
      } else {
        // Still queued or retrying: not a failure yet, and not a success.
        setTestPrintStatus('الفاتورة بالانتظار — بتنطبع أول ما توصل الطابعة.');
      }
    } catch {
      setTestPrintStatus('🔴 تعذرت الطباعة — جرّب مرة ثانية.');
    } finally {
      setPrintingTest(false);
    }
  };

  const handleSave = async () => {
    if (!validation.valid) return;
    setSaving(true);
    setSaveStatus('');
    try {
      const withCapabilities: PrinterProfile = {
        ...profile,
        capabilities: { ...profile.capabilities, paperWidthPx: profile.paperWidthPx ?? profile.capabilities.paperWidthPx },
      };
      await savePrinterProfile(withCapabilities);
      setSavedSnapshot(JSON.stringify(withCapabilities));
      setSaveStatus('✅ تم الحفظ على هذا الجهاز');
    } catch (e) {
      setSaveStatus('🔴 تعذر الحفظ — جرّب مرة ثانية');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accentText} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>إعدادات الطباعة</Text>
      <Text style={styles.subtitle}>
        هذي الإعدادات خاصة بهذا الجهاز وحده — كل جهاز عنده طابعته وإعداداتها.
      </Text>

      <Section title="الوضع الحالي">
        <StatRow label="النشاط" value={device?.businessName || '—'} />
        <StatRow label="الفرع" value={device?.branchName || '—'} />
        <StatRow label="الموظف الحالي" value={staffName || '—'} />
        <StatRow
          label="حالة الاتصال"
          value={online ? '🟢 متصل' : '🔴 غير متصل'}
        />
        <StatRow
          label="الطابعة"
          value={
            savedTarget
              ? `${describeSavedTarget(savedTarget)} · محفوظة`
              : 'ما فيه طابعة محفوظة'
          }
        />
      </Section>

      {/* Set once for the whole business, so it is shown here and changed
          from the dashboard -- a till cannot write it (only an owner can
          update the business row), and a per-device copy would let two
          tills print two different-looking receipts for the same shop. */}
      <Section title="شكل الفاتورة">
        <View style={styles.themeBox}>
          <Text style={styles.themeName}>{receiptTheme(themeId).label}</Text>
          <Text style={styles.themeHint}>
            يُختار من لوحة التحكم ويطبّق على كل الأجهزة. كل الأشكال تطبع فاتورة ضريبية مبسطة معتمدة من هيئة الزكاة والضريبة.
          </Text>
        </View>
      </Section>

      <Section title="الطابعة">
        <FieldLabel>العلامة التجارية (اختياري)</FieldLabel>
        <TextInput style={styles.input} placeholderTextColor={colors.muted} value={profile.brand} onChangeText={t => update({ brand: t })} placeholder="مثال: Epson, Xprinter, Sunmi..." />
        <FieldLabel>الطراز (اختياري)</FieldLabel>
        <TextInput style={styles.input} placeholderTextColor={colors.muted} value={profile.model} onChangeText={t => update({ model: t })} placeholder="مثال: TM-T88VI" />
      </Section>

      <Section title="طريقة التوصيل">
        <View style={styles.row}>
          {(['network', 'bluetooth', 'usb'] as PrinterTransportKind[]).map(t => {
            const supported = SUPPORTED_TRANSPORTS.includes(t);
            const active = profile.transport === t;
            return (
              <TouchableOpacity
                key={t}
                style={[styles.transportOption, active && styles.transportOptionActive, !supported && styles.transportOptionDisabled]}
                disabled={!supported}
                onPress={() => update({ transport: t })}
                activeOpacity={0.8}>
                <Text style={[styles.transportOptionText, active && styles.transportOptionTextActive, !supported && styles.transportOptionTextDisabled]}>{TRANSPORT_LABELS[t]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {profile.transport === 'network' && (
          <>
            <FieldLabel>عنوان الطابعة في الشبكة</FieldLabel>
            <TextInput
              style={styles.input}
              placeholderTextColor={colors.muted}
              value={profile.host}
              onChangeText={t => update({ host: t })}
              placeholder="192.168.1.50"
              autoCapitalize="none"
            />
            <FieldLabel>المنفذ</FieldLabel>
            <TextInput
              style={styles.input}
              placeholderTextColor={colors.muted}
              value={profile.port != null ? String(profile.port) : ''}
              onChangeText={t => update({ port: t ? parseInt(t, 10) : undefined })}
              placeholder="من ورقة إعدادات طابعتك"
              keyboardType="number-pad"
            />
          </>
        )}

        {(profile.transport === 'bluetooth' || profile.transport === 'usb') && (
          <DeviceScanSection
            transport={profile.transport}
            selectedId={profile.transport === 'bluetooth' ? profile.bluetoothId : profile.usbAccessoryId}
            selectedName={profile.transport === 'bluetooth' ? profile.bluetoothName : profile.usbAccessoryName}
            scanning={scanning}
            scanResult={scanResult}
            onScan={() => handleScanDevices(profile.transport as 'bluetooth' | 'usb')}
            onSelect={device => selectDevice(profile.transport as 'bluetooth' | 'usb', device)}
          />
        )}
      </Section>

      <Section title="الورق">
        <FieldLabel>عرض الورق</FieldLabel>
        <View style={styles.row}>
          {PAPER_WIDTH_PRESETS.map(preset => {
            const active = profile.paperWidthPx === preset.px;
            return (
              <TouchableOpacity
                key={preset.px}
                style={[styles.paperOption, active && styles.paperOptionActive]}
                onPress={() => update({ paperWidthPx: preset.px })}
                activeOpacity={0.8}>
                <Text style={[styles.paperOptionText, active && styles.paperOptionTextActive]}>{preset.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <PosCheck
          label="تدعم قص الورق تلقائيًا"
          value={profile.capabilities.supportsCut}
          onChange={v => updateCapabilities({ supportsCut: v })}
        />
      </Section>

      <Section title="طراز الطابعة">
        <View style={styles.rasterCards}>
          {([
            ['sunmi-nt310', 'SUNMI NT310',
             'مُختبرة على جهاز حقيقي: تكتب العربي بنفسها، وتدعم رمز QR والباركود. الأسرع.'],
            ['generic-80mm-arabic', 'طابعة ٨٠ مم تكتب عربي',
             'لو جرّبت طابعتك وطلع العربي سليماً. نفس السرعة.'],
            ['generic-58mm', 'طابعة ٥٨ مم',
             'الورق الصغير. تتغيّر الأعمدة تلقائياً مع عرض الورق.'],
            ['', 'غير معروفة (الأضمن)',
             'ما جرّبناها. نرسل الفاتورة صورة — أبطأ، لكن تطبع صحيحاً على أي طابعة.'],
          ] as const).map(([id, name, desc]) => {
            const active = (profile.capabilityProfileId ?? '') === id;
            return (
              <TouchableOpacity
                key={id || 'unknown'}
                style={[styles.rasterCard, active && styles.rasterCardActive]}
                onPress={() => setProfile({ ...profile, capabilityProfileId: id || undefined })}
                activeOpacity={0.8}>
                <Text style={styles.rasterCardName}>{name}</Text>
                <Text style={styles.rasterCardDesc}>{desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Section>

      <Section title="خيارات الطباعة">
        <PosCheck
          label="طباعة إيصال العميل"
          value={profile.printCustomerReceipt !== false}
          onChange={v => update({ printCustomerReceipt: v })}
        />
        <PosCheck
          label="طباعة تذكرة المطبخ"
          value={profile.printKitchenTicket === true}
          onChange={v => update({ printKitchenTicket: v })}
        />
        <PosCheck
          label="طباعة شعار المنشأة على الإيصال"
          value={profile.printReceiptLogo !== false}
          onChange={v => update({ printReceiptLogo: v })}
        />
        {profile.printKitchenTicket === true && (
          <>
            <FieldLabel>عنوان طابعة المطبخ (اتركه فارغ لو نفس طابعة الكاشير تطبع للمطبخ)</FieldLabel>
            <TextInput
              style={styles.input}
              placeholderTextColor={colors.muted}
              value={profile.kitchenHost || ''}
              onChangeText={t => update({ kitchenHost: t })}
              placeholder="192.168.1.51"
              autoCapitalize="none"
            />
            <FieldLabel>منفذ طابعة المطبخ</FieldLabel>
            <TextInput
              style={styles.input}
              placeholderTextColor={colors.muted}
              value={profile.kitchenPort != null ? String(profile.kitchenPort) : ''}
              onChangeText={t => update({ kitchenPort: t ? parseInt(t, 10) : undefined })}
              placeholder="9100"
              keyboardType="number-pad"
            />
          </>
        )}
      </Section>

      <Section title="درج الكاش">
        <PosCheck
          label="هذه الطابعة موصولة بدرج كاش"
          value={profile.drawerCapabilities.supported}
          onChange={v => updateDrawer({ supported: v })}
        />
        {profile.drawerCapabilities.supported && (
          <>
            <FieldLabel>أمر فتح الدرج الخاص بطابعتك</FieldLabel>
            <TextInput
              style={styles.input}
              placeholderTextColor={colors.muted}
              value={profile.drawerCapabilities.kickCommandBase64 || ''}
              onChangeText={t => updateDrawer({ kickCommandBase64: t || undefined })}
              placeholder="اتركه فارغ — النظام يستخدم الأمر المعتاد"
              autoCapitalize="none"
            />
          </>
        )}
      </Section>

      {!validation.valid && (
        <View style={styles.errorBox}>
          {validation.errors.map((e, i) => (
            <Text key={i} style={styles.errorText}>
              • {e}
            </Text>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.testButton} onPress={handleTestConnection} disabled={testing} activeOpacity={0.8}>
        <Text style={styles.testButtonText}>{testing ? 'جارٍ الاختبار...' : 'اختبار الاتصال'}</Text>
      </TouchableOpacity>
      {!!testResult && <Text style={styles.testResult}>{testResult}</Text>}
      {testTrace.length > 0 && (
        <TouchableOpacity onPress={() => setAdvancedOpen(v => !v)} activeOpacity={0.7}>
          <Text style={styles.advancedToggle}>
            {advancedOpen ? 'إخفاء تفاصيل الدعم الفني' : 'تفاصيل للدعم الفني'}
          </Text>
        </TouchableOpacity>
      )}
      {testTrace.length > 0 && advancedOpen && (
        <View style={styles.traceBox}>
          {testTrace.map((line, i) => (
            <Text key={i} style={styles.traceLine} selectable>
              {line}
            </Text>
          ))}
        </View>
      )}
      {/* The gap between what was just tested and what will actually be
          used. Without this, a green test on freshly-typed values reads
          as proof that printing is configured, while jobs keep going to
          the previously-saved target (or nowhere at all). */}
      {unsaved && (
        <View style={styles.unsavedBox}>
          <Text style={styles.unsavedText}>
            {savedTarget
              ? `فيه تعديلات ما انحفظت. الطباعة وفتح الدرج لسه يستخدمان: ${describeSavedTarget(savedTarget)}`
              : 'فيه تعديلات ما انحفظت، وما فيه طابعة محفوظة — أي طلب ما راح تطلع فاتورته. اضغط «حفظ الإعدادات».'}
          </Text>
        </View>
      )}

      {validation.valid && !saving ? (
        <TouchableOpacity onPress={handleSave} activeOpacity={0.85}>
          <View style={styles.saveButton}>
            <GradientFill gradient={gradients.payButton} radius={radii.md} />
            <Text style={styles.saveButtonText}>حفظ الإعدادات</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={[styles.saveButton, styles.saveButtonDisabled]}>
          {saving ? <ActivityIndicator color={colors.muted} /> : <Text style={[styles.saveButtonText, styles.saveButtonTextDisabled]}>حفظ الإعدادات</Text>}
        </View>
      )}
      {!!saveStatus && <Text style={styles.saveStatus}>{saveStatus}</Text>}

      {/* Below the save button on purpose: it prints from the SAVED
          profile, so it only means anything once saving has happened. */}
      <TouchableOpacity
        style={styles.testButton}
        onPress={handleTestPrint}
        disabled={printingTest}
        activeOpacity={0.8}>
        <Text style={styles.testButtonText}>
          {printingTest ? 'جارٍ الطباعة...' : 'طباعة اختبار'}
        </Text>
      </TouchableOpacity>
      {!!testPrintStatus && <Text style={styles.testResult}>{testPrintStatus}</Text>}

      {/* اختبار الوضع النصي. مؤقت وصريح: يقيس ما إذا كانت الطابعة تقدر
          تكتب العربي بنفسها، وهو السؤال الذي يقرر هل نُعيد كتابة تصيير
          الفاتورة كلها أم لا. يُحذف بعد أن يُجاب. */}
      <TouchableOpacity
        style={styles.testButton}
        onPress={handleTextProbe}
        disabled={probing}
        activeOpacity={0.8}>
        <Text style={styles.testButtonText}>
          {probing ? 'جارٍ الطباعة...' : 'اختبار الطباعة النصية (سرعة)'}
        </Text>
      </TouchableOpacity>
      {!!textProbeStatus && <Text style={styles.testResult}>{textProbeStatus}</Text>}
    </ScrollView>
  );
}

/** The PWA's .shift-stat-row: label at one end, value at the other. */
function StatRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

// .pos-check / .pos-check-box (rakeen-pos-additions.css) -- a custom
// lime-filled checkbox, not an OS Switch, matching the PWA's own
// replacement for native checkboxes everywhere in Settings.
function PosCheck({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const styles = useStyles();
  return (
    <TouchableOpacity style={styles.posCheck} onPress={() => onChange(!value)} activeOpacity={0.8}>
      <View style={[styles.posCheckBox, value && styles.posCheckBoxChecked]}>
        {value && <Text style={styles.posCheckMark}>✓</Text>}
      </View>
      <Text style={styles.posCheckLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Feature Parity Pass -- Bluetooth/USB. Real device discovery UI --
 *  never a free-text field for an id, per requirement 13 ("do not create
 *  fake implementations"): a profile can only point at a device this
 *  scan genuinely found and the cashier tapped. */
function DeviceScanSection({
  transport,
  selectedId,
  selectedName,
  scanning,
  scanResult,
  onScan,
  onSelect,
}: {
  transport: 'bluetooth' | 'usb';
  selectedId?: string;
  selectedName?: string;
  scanning: boolean;
  scanResult: { devices: DiscoveredDevice[]; error?: string } | null;
  onScan: () => void;
  onSelect: (device: DiscoveredDevice) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.deviceScanBlock}>
      <FieldLabel>{transport === 'bluetooth' ? 'جهاز البلوتوث' : 'جهاز USB'}</FieldLabel>
      {selectedId ? (
        <Text style={styles.selectedDeviceText}>✅ محدد: {selectedName || selectedId}</Text>
      ) : (
        <Text style={styles.selectedDeviceText}>لم يُحدد جهاز بعد</Text>
      )}
      <TouchableOpacity style={styles.scanButton} onPress={onScan} disabled={scanning} activeOpacity={0.8}>
        <Text style={styles.scanButtonText}>{scanning ? 'جارٍ البحث...' : 'البحث عن الأجهزة'}</Text>
      </TouchableOpacity>
      {scanResult?.error && <Text style={styles.errorText}>خطأ: {scanResult.error}</Text>}
      {scanResult && !scanResult.error && scanResult.devices.length === 0 && (
        <Text style={styles.selectedDeviceText}>لم يتم العثور على أجهزة.</Text>
      )}
      {scanResult?.devices.map(device => (
        <TouchableOpacity key={device.id} style={styles.deviceRow} onPress={() => onSelect(device)} activeOpacity={0.8}>
          <Text style={styles.deviceRowText}>{device.name || device.id}</Text>
          {device.rssi != null && <Text style={styles.deviceRowRssi}>{device.rssi} dBm</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: spacing[4] },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.text, marginBottom: 4 },
  subtitle: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.muted, marginBottom: spacing[4] },
  section: { backgroundColor: colors.cardBg, borderRadius: radii.lg, padding: spacing[4], marginBottom: spacing[3], borderWidth: 1, borderColor: colors.line },
  sectionTitle: { fontFamily: fonts.sansBold, fontSize: 14, marginBottom: spacing[2], color: colors.text },
  fieldLabel: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.muted, marginBottom: 6, marginTop: spacing[2] },
  // .pos-auth-field input
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.surf1, color: colors.text, padding: 10, fontFamily: fonts.sansSemiBold, fontSize: 14, textAlign: 'right' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginBottom: 6 },
  transportOption: { paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radii.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf1 },
  transportOptionActive: { backgroundColor: colors.lime, borderColor: colors.lime },
  transportOptionDisabled: { opacity: 0.5 },
  transportOptionText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text },
  transportOptionTextActive: { color: colors.flagGreenDeep },
  transportOptionTextDisabled: { color: colors.muted },
  paperOption: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: radii.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf1 },
  paperOptionActive: { backgroundColor: colors.lime, borderColor: colors.lime },
  paperOptionText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text },
  paperOptionTextActive: { color: colors.flagGreenDeep },
  // .pos-check
  posCheck: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 44, paddingVertical: 6 },
  // .pos-check-box
  posCheckBox: { width: 20, height: 20, marginTop: 2, borderRadius: 6, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surf1, alignItems: 'center', justifyContent: 'center' },
  posCheckBoxChecked: { backgroundColor: colors.lime, borderColor: colors.lime },
  posCheckMark: { fontSize: 12, fontWeight: '800', color: colors.flagGreenDeep },
  posCheckLabel: { flex: 1, fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.text, lineHeight: 19 },
  errorBox: { backgroundColor: `rgba(${colors.dangerRgb},0.12)`, borderRadius: radii.md, padding: spacing[3], marginBottom: spacing[3] },
  errorText: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.danger, marginBottom: 4 },
  // secondary-action button, reusing .pos-staff-btn's outline look
  testButton: { backgroundColor: colors.surf1, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, padding: spacing[4], alignItems: 'center', marginBottom: spacing[2] },
  testButtonText: { fontFamily: fonts.sansBold, color: colors.text },
  testResult: { fontFamily: fonts.sansSemiBold, fontSize: 12, textAlign: 'center', marginBottom: spacing[3], color: colors.muted },
  saveButton: { borderRadius: radii.md, padding: spacing[4], alignItems: 'center', justifyContent: 'center', marginBottom: 30, backgroundColor: colors.lime },
  saveButtonDisabled: { backgroundColor: colors.surf2 },
  saveButtonText: { fontFamily: fonts.sansBold, color: colors.flagGreenDeep },
  saveButtonTextDisabled: { color: colors.muted },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  statLabel: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.muted },
  statValue: { fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.text, flexShrink: 1, textAlign: 'left' },

  themeBox: { backgroundColor: colors.surf1, borderRadius: radii.sm, padding: spacing[3], gap: spacing[1] },
  themeName: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.text },
  themeHint: { fontFamily: fonts.sansMedium, fontSize: 11, color: colors.muted, lineHeight: 17 },

  advancedToggle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: spacing[2],
    marginBottom: spacing[1],
  },

  traceBox: { backgroundColor: colors.surf1, borderRadius: radii.sm, padding: spacing[2], marginBottom: spacing[3] },
  traceLine: { fontFamily: fonts.monoMedium, fontSize: 9.5, color: colors.muted, writingDirection: 'ltr', textAlign: 'left', lineHeight: 14 },
  rasterCards: { gap: 8 },
  rasterCard: {
    borderWidth: 1, borderColor: colors.line, borderRadius: radii.md,
    backgroundColor: colors.surf1, padding: 14, gap: 4,
  },
  rasterCardActive: { borderColor: colors.accentText, backgroundColor: colors.surf2 },
  rasterCardName: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text },
  rasterCardDesc: { fontFamily: fonts.sansRegular, fontSize: 11.5, lineHeight: 17, color: colors.muted },
  unsavedBox: {
    backgroundColor: `rgba(${colors.amberRgb},0.15)`,
    borderRadius: radii.sm,
    padding: spacing[3],
    marginBottom: spacing[3],
  },
  unsavedText: { fontFamily: fonts.sansBold, fontSize: 11.5, color: colors.amber, lineHeight: 17 },
  saveStatus: { fontFamily: fonts.sansSemiBold, fontSize: 12, textAlign: 'center', marginBottom: spacing[5], color: colors.muted },
  deviceScanBlock: { marginTop: 4 },
  selectedDeviceText: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.text, marginBottom: spacing[2] },
  scanButton: { backgroundColor: colors.surf1, borderWidth: 1, borderColor: colors.line, borderRadius: radii.sm, padding: spacing[2], alignItems: 'center', marginBottom: spacing[2] },
  scanButtonText: { fontFamily: fonts.sansBold, color: colors.text, fontSize: 12 },
  deviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing[2],
    borderRadius: radii.sm,
    backgroundColor: colors.surf1,
    marginBottom: 6,
  },
  deviceRowText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text, flex: 1 },
  deviceRowRssi: { fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.muted },
  }),
);
