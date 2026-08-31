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

    /// Matches the target.host/target.port/escPosBase64/timeoutMs shape
    /// PrintJob in src/platform/printer.ts sends — port is required, never
    /// defaulted to 9100 here. Also accepts the flat {host,port,...} shape
    /// for backward compatibility with the original POC screen.
    @objc
    func print(_ job: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        let targetDict = (job["target"] as? NSDictionary) ?? job
        guard let host = targetDict["host"] as? String,
              let portNumber = targetDict["port"] as? NSNumber,
              let base64 = job["escPosBase64"] as? String else {
            resolve(["ok": false, "error": "INVALID_TARGET"])
            return
        }
        guard let bytes = Data(base64Encoded: base64) else {
            resolve(["ok": false, "error": "RENDER_FAILED"])
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

    /// target: { host: String, port: Int }
    @objc
    func testConnection(_ target: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let host = target["host"] as? String,
              let portNumber = target["port"] as? NSNumber else {
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
    func getCapabilities(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve([
            "supportedTransports": ["network"],
            "supportsCut": true,
            "supportsCashDrawerKick": true,
            "paperWidthPx": 576,
        ])
    }
}
