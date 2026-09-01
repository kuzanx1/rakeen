import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getPrinterProfile, savePrinterProfile } from '../infrastructure/printerProfileStore';
import { Printer } from '../platform/printer';
import {
  validatePrinterProfile,
  emptyPrinterProfile,
  PAPER_WIDTH_PRESETS,
  SUPPORTED_TRANSPORTS,
} from '../domain/printerProfile';
import type { PrinterProfile, PrinterTransportKind } from '../platform/printer';

const TRANSPORT_LABELS: Record<PrinterTransportKind, string> = {
  network: 'شبكة (Network)',
  bluetooth: 'بلوتوث (غير مدعوم بعد)',
  usb: 'USB (غير مدعوم بعد)',
};

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

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult('');
    try {
      if (!Printer) {
        setTestResult('🔴 لا توجد وحدة طابعة حقيقية على هذا الجهاز/البناء');
        return;
      }
      if (profile.transport !== 'network' || !profile.host || !profile.port) {
        setTestResult('🔴 أدخل عنوان ومنفذ صحيحين أولاً');
        return;
      }
      const result = await Printer.testConnection({ transport: 'network', host: profile.host, port: profile.port });
      setTestResult(
        result.reachable
          ? `🟢 متصل (${result.latencyMs?.toFixed(0)}ms) — هذا يثبت الوصول الحقيقي عبر الشبكة فقط، وليس نجاح طباعة فعلي`
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
});
