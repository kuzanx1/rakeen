import Foundation
import React

/// The real React Native NativeModule for printing — this is what
/// `NativeModules.RakeenPrinterModule` in
/// react-native-poc/src/platform/printer.ts resolves to on iOS. Exposed to
/// RN via RakeenPrinterModule.m (RCT_EXTERN_MODULE — the standard
/// classic-native-module bridging file; React Native's New Architecture,
/// enabled by default in this scaffold, still runs classic modules like
/// this one through its TurboModule interop layer without requiring
/// Codegen for a first POC).
///
/// UNVERIFIED beyond compilation — never run against a real printer or
/// device. See docs/react-native-poc/phase4-ios.md for exactly what
/// "Verified" means for this file vs. what still needs real hardware.
@objc(RakeenPrinterModule)
class RakeenPrinterModule: NSObject {

    private let transport = NetworkPrinterTransport()
    private let bluetoothTransport = BluetoothPrinterTransport()

    @objc
    static func requiresMainQueueSetup() -> Bool { return false }

    /// Matches the target.host/target.port/escPosBase64/timeoutMs shape
    /// PrintJob in src/platform/printer.ts sends — port is required, never
    /// defaulted to 9100 here. Also accepts the flat {host,port,...} shape
    /// for backward compatibility with the original POC screen. Feature
    /// Parity Pass -- Bluetooth/USB: `target.transport` now also routes to
    /// BluetoothPrinterTransport for `bluetoothId`; `usb` genuinely has no
    /// iOS implementation (ExternalAccessory/MFi-only restriction) and
    /// reports that honestly rather than pretending to succeed.
    @objc
    func print(_ job: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        let targetDict = (job["target"] as? NSDictionary) ?? job
        guard let base64 = job["escPosBase64"] as? String, let bytes = Data(base64Encoded: base64) else {
            resolve(["ok": false, "error": "RENDER_FAILED"])
            return
        }
        let timeoutMs = (job["timeoutMs"] as? NSNumber)?.intValue ?? 8000
        let transportKind = targetDict["transport"] as? String ?? "network"

        switch transportKind {
        case "bluetooth":
            guard let bluetoothId = targetDict["bluetoothId"] as? String else {
                resolve(["ok": false, "error": "INVALID_TARGET"])
                return
            }
            bluetoothTransport.send(bytes: bytes, peripheralId: bluetoothId, timeoutMs: timeoutMs) { ok, errorDetail in
                if ok {
                    resolve(["ok": true])
                } else if errorDetail == BluetoothPrinterTransport.TransportError.permissionDenied.rawValue {
                    resolve(["ok": false, "error": "PERMISSION_DENIED", "errorDetail": errorDetail ?? ""])
                } else {
                    resolve(["ok": false, "error": "PRINTER_CONNECTION_FAILED", "errorDetail": errorDetail ?? "unknown_error"])
                }
            }
        case "usb":
            resolve(["ok": false, "error": "TRANSPORT_NOT_SUPPORTED", "errorDetail": "usb_not_supported_on_ios"])
        default:
            guard let host = targetDict["host"] as? String, let portNumber = targetDict["port"] as? NSNumber else {
                resolve(["ok": false, "error": "INVALID_TARGET"])
                return
            }
            let port = UInt16(truncating: portNumber)
            transport.send(bytes: bytes, host: host, port: port) { ok, errorDetail in
                if ok {
                    resolve(["ok": true])
                } else {
                    resolve(["ok": false, "error": "PRINTER_CONNECTION_FAILED", "errorDetail": errorDetail ?? "unknown_error"])
                }
            }
        }
    }

    /// target: { transport, host?, port?, bluetoothId? }
    @objc
    func testConnection(_ target: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        let transportKind = target["transport"] as? String ?? "network"
        switch transportKind {
        case "bluetooth":
            guard let bluetoothId = target["bluetoothId"] as? String else {
                resolve(["reachable": false, "error": "INVALID_TARGET"])
                return
            }
            bluetoothTransport.testConnection(peripheralId: bluetoothId, timeoutMs: 8000) { reachable, latencyMs, errorDetail in
                var result: [String: Any] = ["reachable": reachable]
                if let latencyMs = latencyMs { result["latencyMs"] = latencyMs }
                if let errorDetail = errorDetail {
                    result["error"] = "PRINTER_CONNECTION_FAILED"
                    result["errorDetail"] = errorDetail
                }
                resolve(result)
            }
        case "usb":
            resolve(["reachable": false, "error": "TRANSPORT_NOT_SUPPORTED"])
        default:
            guard let host = target["host"] as? String, let portNumber = target["port"] as? NSNumber else {
                resolve(["reachable": false, "error": "INVALID_TARGET"])
                return
            }
            let port = UInt16(truncating: portNumber)
            transport.testConnection(host: host, port: port) { reachable, latencyMs, errorDetail in
                var result: [String: Any] = ["reachable": reachable]
                if let latencyMs = latencyMs { result["latencyMs"] = latencyMs }
                if let errorDetail = errorDetail {
                    result["error"] = "PRINTER_CONNECTION_FAILED"
                    result["errorDetail"] = errorDetail
                }
                resolve(result)
            }
        }
    }

    /// transport: 'network' | 'bluetooth' | 'usb', timeoutMs: Int.
    /// 'network' and 'usb' (no iOS USB host access) always resolve to an
    /// empty array -- never a fabricated device list.
    @objc
    func scanDevices(_ transportKind: String, timeoutMs: NSNumber, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard transportKind == "bluetooth" else {
            resolve(["devices": []])
            return
        }
        bluetoothTransport.scan(timeoutMs: timeoutMs.intValue) { devices, error in
            let mapped = devices.map { device -> [String: Any] in
                ["id": device.id, "rssi": device.rssi, "name": device.name ?? NSNull()]
            }
            var result: [String: Any] = ["devices": mapped]
            if let error = error {
                result["error"] = error == .permissionDenied ? "PERMISSION_DENIED" : "PRINTER_UNAVAILABLE"
            }
            resolve(result)
        }
    }

    /// Honest per docs/ios-native-bridge-interfaces.md's known gap: no
    /// bidirectional ESC/POS status read-back exists anywhere in this
    /// project yet, on either the Capacitor/Swift side or here. Always
    /// reports "unknown" rather than fabricating an "idle"/"ready" status
    /// nothing actually confirmed.
    @objc
    func getStatus(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve(["status": "unknown"])
    }

    /// 'usb' is genuinely absent -- iOS has no USB host API reachable by a
    /// normal (non-MFi-certified) app for a generic ESC/POS printer, a
    /// real Apple platform restriction, not an unimplemented TODO.
    @objc
    func getCapabilities(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve([
            "supportedTransports": ["network", "bluetooth"],
            "supportsCut": true,
            "supportsCashDrawerKick": true,
            "paperWidthPx": 576,
        ])
    }
}
