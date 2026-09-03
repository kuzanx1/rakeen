import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { getPrinterProfile, savePrinterProfile } from '../infrastructure/printerProfileStore';
import { Printer } from '../platform/printer';
import {
  validatePrinterProfile,
  emptyPrinterProfile,
  PAPER_WIDTH_PRESETS,
  SUPPORTED_TRANSPORTS,
  profileToPrinterTarget,
} from '../domain/printerProfile';
import type { PrinterProfile, PrinterTransportKind, DiscoveredDevice } from '../platform/printer';
import { colors, fonts, gradients, radii, spacing } from './theme';

const TRANSPORT_LABELS: Record<PrinterTransportKind, string> = {
  network: 'شبكة (Network)',
  bluetooth: 'بلوتوث (Bluetooth)',
  usb: 'USB',
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
export default function PrinterSettingsScreen() {
  const [profile, setProfile] = useState<PrinterProfile>(emptyPrinterProfile());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ devices: DiscoveredDevice[]; error?: string } | null>(null);

  useEffect(() => {
    (async () => {
      const existing = await getPrinterProfile();
      if (existing) setProfile(existing);
      setLoading(false);
    })();
  }, []);

  const validation = validatePrinterProfile(profile);

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
        setScanResult({ devices: [], error: 'لا توجد وحدة طابعة حقيقية على هذا الجهاز/البناء' });
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
    try {
      if (!Printer) {
        setTestResult('🔴 لا توجد وحدة طابعة حقيقية على هذا الجهاز/البناء');
        return;
      }
      const target = profileToPrinterTarget(profile);
      if (!target) {
        setTestResult('🔴 أكمل إعداد الطابعة أولًا (عنوان/منفذ صحيحين، أو اختر جهاز بلوتوث/USB)');
        return;
      }
      const result = await Printer.testConnection(target);
      setTestResult(
        result.reachable
          ? `🟢 متصل (${result.latencyMs?.toFixed(0)}ms) — هذا يثبت الوصول الحقيقي فقط، وليس نجاح طباعة فعلي`
          : `🔴 غير متصل — ${result.error}${result.errorDetail ? ` (${result.errorDetail})` : ''}`,
      );
    } catch (e) {
      setTestResult(`🔴 خطأ غير متوقع: ${String(e)}`);
    } finally {
      setTesting(false);
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
      setSaveStatus('✅ تم الحفظ محليًا على هذا الجهاز');
    } catch (e) {
      setSaveStatus(`🔴 تعذر الحفظ: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.lime} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>إعدادات الطابعة</Text>
      <Text style={styles.subtitle}>
        هذا الإعداد خاص بهذا الجهاز فقط، ولا يفترض طرازًا أو منفذًا معينًا — يجب إدخال القيم الحقيقية لطابعتك.
      </Text>

      <Section title="الطابعة">
        <FieldLabel>العلامة التجارية (اختياري)</FieldLabel>
        <TextInput style={styles.input} placeholderTextColor={colors.muted} value={profile.brand} onChangeText={t => update({ brand: t })} placeholder="مثال: Epson, Xprinter, Sunmi..." />
        <FieldLabel>الطراز (اختياري)</FieldLabel>
        <TextInput style={styles.input} placeholderTextColor={colors.muted} value={profile.model} onChangeText={t => update({ model: t })} placeholder="مثال: TM-T88VI" />
      </Section>

      <Section title="النقل (Transport)">
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
            <FieldLabel>عنوان IP / المضيف</FieldLabel>
            <TextInput
              style={styles.input}
              placeholderTextColor={colors.muted}
              value={profile.host}
              onChangeText={t => update({ host: t })}
              placeholder="192.168.1.50"
              autoCapitalize="none"
            />
            <FieldLabel>المنفذ (Port) — لا يوجد افتراضي</FieldLabel>
            <TextInput
              style={styles.input}
              placeholderTextColor={colors.muted}
              value={profile.port != null ? String(profile.port) : ''}
              onChangeText={t => update({ port: t ? parseInt(t, 10) : undefined })}
              placeholder="أدخل المنفذ الحقيقي لطابعتك"
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

      <Section title="الورق والقدرات">
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
            <FieldLabel>عنوان IP لطابعة المطبخ (اختياري — فارغ يعني نفس طابعة العميل)</FieldLabel>
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
            <FieldLabel>أمر فتح الدرج المخصص (اختياري، Base64)</FieldLabel>
            <TextInput
              style={styles.input}
              placeholderTextColor={colors.muted}
              value={profile.drawerCapabilities.kickCommandBase64 || ''}
              onChangeText={t => updateDrawer({ kickCommandBase64: t || undefined })}
              placeholder="اتركه فارغًا لاستخدام أمر ESC/POS القياسي"
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

      {validation.valid && !saving ? (
        <TouchableOpacity onPress={handleSave} activeOpacity={0.85}>
          <LinearGradient colors={gradients.payButton.colors} start={gradients.payButton.start} end={gradients.payButton.end} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>حفظ الإعدادات</Text>
          </LinearGradient>
        </TouchableOpacity>
      ) : (
        <View style={[styles.saveButton, styles.saveButtonDisabled]}>
          {saving ? <ActivityIndicator color={colors.muted} /> : <Text style={[styles.saveButtonText, styles.saveButtonTextDisabled]}>حفظ الإعدادات</Text>}
        </View>
      )}
      {!!saveStatus && <Text style={styles.saveStatus}>{saveStatus}</Text>}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

// .pos-check / .pos-check-box (rakeen-pos-additions.css) -- a custom
// lime-filled checkbox, not an OS Switch, matching the PWA's own
// replacement for native checkboxes everywhere in Settings.
function PosCheck({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
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

const styles = StyleSheet.create({
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
  saveButton: { borderRadius: radii.md, padding: spacing[4], alignItems: 'center', justifyContent: 'center', marginBottom: 30 },
  saveButtonDisabled: { backgroundColor: colors.surf2 },
  saveButtonText: { fontFamily: fonts.sansBold, color: colors.flagGreenDeep },
  saveButtonTextDisabled: { color: colors.muted },
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
});
