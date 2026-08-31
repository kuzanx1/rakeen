import Foundation
import React

/// Standard ESC/POS drawer-kick sequence (pin 2, ~25ms/250ms timing) —
/// same near-universal default already used and documented in
/// ios/App/App/MainViewController.swift's Capacitor bridge. Overridable
/// per `CashDrawerOpenOptions.kickCommandBase64`
/// (react-native-poc/src/platform/cashDrawer.ts) rather than hardcoded
/// with no escape hatch — but not overridden anywhere yet, since no real
/// hardware has ever required different bytes.
private let defaultKickCommand: [UInt8] = [0x1B, 0x70, 0x00, 0x19, 0xFA]

@objc(RakeenCashDrawerModule)
class RakeenCashDrawerModule: NSObject {

    private let transport = NetworkPrinterTransport()

    @objc
    static func requiresMainQueueSetup() -> Bool { return false }

    /// options: { target: { host, port }, kickCommandBase64?: String,
    /// operationId: String, timeoutMs: Int }. `operationId` is accepted
    /// but intentionally NOT used for dedup here -- double-kick protection
    /// is enforced JS-side in openCashDrawer()
    /// (react-native-poc/src/platform/cashDrawer.ts), since this native
    /// method has no concept of "the same logical operation" across calls;
    /// it only ever executes exactly one kick per invocation.
    @objc
    func open(_ options: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let target = options["target"] as? NSDictionary,
              let host = target["host"] as? String,
              let portNumber = target["port"] as? NSNumber else {
            resolve(["ok": false, "error": "INVALID_TARGET"])
            return
        }
        let port = UInt16(truncating: portNumber)

        let bytes: Data
        if let overrideBase64 = options["kickCommandBase64"] as? String,
           let overrideBytes = Data(base64Encoded: overrideBase64) {
            bytes = overrideBytes
        } else {
            bytes = Data(defaultKickCommand)
        }

        transport.send(bytes: bytes, host: host, port: port) { ok, errorDetail in
            if ok {
                resolve(["ok": true])
            } else {
                resolve(["ok": false, "error": "PRINTER_CONNECTION_FAILED", "errorDetail": errorDetail ?? "unknown_error"])
            }
        }
    }

    @objc
    func getCapabilities(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve(["supported": true])
    }
}
