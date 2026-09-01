import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
      <View style={styles.center}>
        <ActivityIndicator />
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
        <TextInput style={styles.input} value={profile.brand} onChangeText={t => update({ brand: t })} placeholder="مثال: Epson, Xprinter, Sunmi..." />
        <FieldLabel>الطراز (اختياري)</FieldLabel>
        <TextInput style={styles.input} value={profile.model} onChangeText={t => update({ model: t })} placeholder="مثال: TM-T88VI" />
      </Section>

      <Section title="النقل (Transport)">
        <View style={styles.row}>
          {(['network', 'bluetooth', 'usb'] as PrinterTransportKind[]).map(t => {
            const supported = SUPPORTED_TRANSPORTS.includes(t);
            return (
              <TouchableOpacity
                key={t}
                style={[styles.transportOption, profile.transport === t && styles.transportOptionActive, !supported && styles.transportOptionDisabled]}
                disabled={!supported}
                onPress={() => update({ transport: t })}>
                <Text style={[styles.transportOptionText, !supported && styles.transportOptionTextDisabled]}>{TRANSPORT_LABELS[t]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {profile.transport === 'network' && (
          <>
            <FieldLabel>عنوان IP / المضيف</FieldLabel>
            <TextInput
              style={styles.input}
              value={profile.host}
              onChangeText={t => update({ host: t })}
              placeholder="192.168.1.50"
              autoCapitalize="none"
            />
            <FieldLabel>المنفذ (Port) — لا يوجد افتراضي</FieldLabel>
            <TextInput
              style={styles.input}
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
          {PAPER_WIDTH_PRESETS.map(preset => (
            <TouchableOpacity
              key={preset.px}
              style={[styles.paperOption, profile.paperWidthPx === preset.px && styles.paperOptionActive]}
              onPress={() => update({ paperWidthPx: preset.px })}>
              <Text style={styles.paperOptionText}>{preset.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <SwitchRow
          label="تدعم قص الورق تلقائيًا"
          value={profile.capabilities.supportsCut}
          onChange={v => updateCapabilities({ supportsCut: v })}
        />
      </Section>

      <Section title="خيارات الطباعة">
        <SwitchRow
          label="طباعة إيصال العميل"
          value={profile.printCustomerReceipt !== false}
          onChange={v => update({ printCustomerReceipt: v })}
        />
        <SwitchRow
          label="طباعة تذكرة المطبخ"
          value={profile.printKitchenTicket === true}
          onChange={v => update({ printKitchenTicket: v })}
        />
        <SwitchRow
          label="طباعة شعار المنشأة على الإيصال"
          value={profile.printReceiptLogo !== false}
          onChange={v => update({ printReceiptLogo: v })}
        />
        {profile.printKitchenTicket === true && (
          <>
            <FieldLabel>عنوان IP لطابعة المطبخ (اختياري — فارغ يعني نفس طابعة العميل)</FieldLabel>
            <TextInput
              style={styles.input}
              value={profile.kitchenHost || ''}
              onChangeText={t => update({ kitchenHost: t })}
              placeholder="192.168.1.51"
              autoCapitalize="none"
            />
            <FieldLabel>منفذ طابعة المطبخ</FieldLabel>
            <TextInput
              style={styles.input}
              value={profile.kitchenPort != null ? String(profile.kitchenPort) : ''}
              onChangeText={t => update({ kitchenPort: t ? parseInt(t, 10) : undefined })}
              placeholder="9100"
              keyboardType="number-pad"
            />
          </>
        )}
      </Section>

      <Section title="درج الكاش">
        <SwitchRow
          label="هذه الطابعة موصولة بدرج كاش"
          value={profile.drawerCapabilities.supported}
          onChange={v => updateDrawer({ supported: v })}
        />
        {profile.drawerCapabilities.supported && (
          <>
            <FieldLabel>أمر فتح الدرج المخصص (اختياري، Base64)</FieldLabel>
            <TextInput
              style={styles.input}
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

      <TouchableOpacity style={styles.testButton} onPress={handleTestConnection} disabled={testing}>
        <Text style={styles.testButtonText}>{testing ? 'جارٍ الاختبار...' : 'اختبار الاتصال'}</Text>
      </TouchableOpacity>
      {!!testResult && <Text style={styles.testResult}>{testResult}</Text>}

      <TouchableOpacity
        style={[styles.saveButton, !validation.valid && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={!validation.valid || saving}>
        <Text style={styles.saveButtonText}>{saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}</Text>
      </TouchableOpacity>
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

function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
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
      <TouchableOpacity style={styles.scanButton} onPress={onScan} disabled={scanning}>
        <Text style={styles.scanButtonText}>{scanning ? 'جارٍ البحث...' : 'البحث عن الأجهزة'}</Text>
      </TouchableOpacity>
      {scanResult?.error && <Text style={styles.errorText}>خطأ: {scanResult.error}</Text>}
      {scanResult && !scanResult.error && scanResult.devices.length === 0 && (
        <Text style={styles.selectedDeviceText}>لم يتم العثور على أجهزة.</Text>
      )}
      {scanResult?.devices.map(device => (
        <TouchableOpacity key={device.id} style={styles.deviceRow} onPress={() => onSelect(device)}>
          <Text style={styles.deviceRowText}>{device.name || device.id}</Text>
          {device.rssi != null && <Text style={styles.deviceRowRssi}>{device.rssi} dBm</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f2f5f0' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16 },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  subtitle: { fontSize: 12, color: '#666', marginBottom: 16 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e0e0e0' },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 10, color: '#333' },
  fieldLabel: { fontSize: 12, color: '#666', marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  transportOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f2f5f0' },
  transportOptionActive: { backgroundColor: '#3f51b5' },
  transportOptionDisabled: { backgroundColor: '#f0f0f0', opacity: 0.6 },
  transportOptionText: { fontSize: 12, fontWeight: '700', color: '#333' },
  transportOptionTextDisabled: { color: '#999' },
  paperOption: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f2f5f0' },
  paperOptionActive: { backgroundColor: '#8bc34a' },
  paperOptionText: { fontSize: 12, fontWeight: '700' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  switchLabel: { fontSize: 13, color: '#333', flex: 1, marginEnd: 10 },
  errorBox: { backgroundColor: '#fdecea', borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { fontSize: 12, color: '#c0392b', marginBottom: 4 },
  testButton: { backgroundColor: '#3f51b5', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 8 },
  testButtonText: { fontWeight: '700', color: '#fff' },
  testResult: { fontSize: 12, textAlign: 'center', marginBottom: 12, color: '#333' },
  saveButton: { backgroundColor: '#8bc34a', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 30 },
  saveButtonDisabled: { backgroundColor: '#ccc' },
  saveButtonText: { fontWeight: '700', color: '#1a1a1a' },
  saveStatus: { fontSize: 12, textAlign: 'center', marginBottom: 20 },
  deviceScanBlock: { marginTop: 4 },
  selectedDeviceText: { fontSize: 12, color: '#333', marginBottom: 8 },
  scanButton: { backgroundColor: '#3f51b5', borderRadius: 8, padding: 10, alignItems: 'center', marginBottom: 8 },
  scanButtonText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  deviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f2f5f0',
    marginBottom: 6,
  },
  deviceRowText: { fontSize: 12, fontWeight: '700', color: '#333', flex: 1 },
  deviceRowRssi: { fontSize: 11, color: '#666' },
});
