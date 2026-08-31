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
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { Printer, printReceipt } from './src/platform/printer';
import { CashDrawer, openCashDrawer } from './src/platform/cashDrawer';
import { getDeviceInfo, DeviceInfo } from './src/platform/device';

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

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

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
    <SafeAreaView style={[styles.root, isDarkMode && styles.rootDark]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Rakeen — React Native POC</Text>
        <Text style={styles.subtitle}>
          يثبت مسار واحد كامل: RN UI → JS → NativeModules → Swift/Kotlin → Socket حقيقي.
          ليس إعادة بناء للكاشير — راجع docs/react-native-poc/phase7-poc-screen.md
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
            value={host}
            onChangeText={setHost}
            placeholder="192.168.1.50"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            value={port}
            onChangeText={setPort}
            placeholder="9100 (default UI value only, never assumed by the contract)"
            keyboardType="number-pad"
          />
          <Text style={styles.value}>Printer Status: {printerStatus}</Text>
        </View>

        <TouchableOpacity style={styles.button} onPress={handleTestPrinter}>
          <Text style={styles.buttonText}>Test Printer</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handlePrintTestReceipt}>
          <Text style={styles.buttonText}>Print Test Receipt</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleOpenDrawer}>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f2f5f0' },
  rootDark: { backgroundColor: '#111111' },
  scroll: { padding: 16 },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  subtitle: { fontSize: 12, color: '#666', marginBottom: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  cardTitle: { fontSize: 13, fontWeight: '700', marginBottom: 6, color: '#333' },
  value: { fontSize: 13, color: '#444' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    fontSize: 14,
  },
  button: {
    backgroundColor: '#8bc34a',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonText: { fontWeight: '700', color: '#1a1a1a' },
  logLine: { fontSize: 11, color: '#555', marginBottom: 2 },
});

export default App;
