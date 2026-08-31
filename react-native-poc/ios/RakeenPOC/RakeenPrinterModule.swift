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

    @objc
    static func requiresMainQueueSetup() -> Bool { return false }

    /// job: { host: String, port: Int, escPosBase64: String, timeoutMs: Int }
    /// Matches PrintJob/PrinterTarget in src/platform/printer.ts exactly —
    /// port is required, never defaulted to 9100 here.
    @objc
    func print(_ job: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let host = job["host"] as? String,
              let portNumber = job["port"] as? NSNumber,
              let base64 = job["escPosBase64"] as? String,
              let bytes = Data(base64Encoded: base64) else {
            resolve(["ok": false, "error": "invalid_target"])
            return
        }
        let port = UInt16(truncating: portNumber)
        transport.send(bytes: bytes, host: host, port: port) { ok, error in
            if ok {
                resolve(["ok": true])
            } else {
                resolve(["ok": false, "error": error ?? "unknown_error"])
            }
        }
    }

    /// target: { host: String, port: Int }
    @objc
    func testConnection(_ target: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let host = target["host"] as? String,
              let portNumber = target["port"] as? NSNumber else {
            resolve(["reachable": false, "error": "invalid_target"])
            return
        }
        let port = UInt16(truncating: portNumber)
        transport.testConnection(host: host, port: port) { reachable, latencyMs, error in
            var result: [String: Any] = ["reachable": reachable]
            if let latencyMs = latencyMs { result["latencyMs"] = latencyMs }
            if let error = error { result["error"] = error }
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

    @objc
    func capabilities(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve([
            "supportedTransports": ["network"],
            "supportsCut": true,
            "supportsCashDrawerKick": true,
            "paperWidthPx": 576,
        ])
    }
}
