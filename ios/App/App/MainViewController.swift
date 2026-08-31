import UIKit
import WebKit
import Capacitor

/// UNVERIFIED DRAFT — written on Windows, never compiled, never run in
/// Xcode or on a device. Matches docs/ios-native-bridge-interfaces.md §1/§2
/// as closely as this environment allows to prove. Wired in via
/// Base.lproj/Main.storyboard's customClass (see that file's diff) —
/// replaces the default CAPBridgeViewController so we can reach the
/// underlying WKWebView's WKUserContentController before the page loads.
///
/// Why a hand-rolled WKUserScript instead of a normal Capacitor plugin: the
/// web side (rakeen-pos.js) already calls a bare `window.AndroidPrint` /
/// `window.NativeCashDrawer` global directly — that contract predates this
/// iOS work and intentionally isn't being changed (see the "don't touch the
/// web layer" instruction this was built against). A standard Capacitor
/// plugin would instead surface as `window.Capacitor.Plugins.AndroidPrint`,
/// which would require changing rakeen-pos.js. Injecting a WKUserScript that
/// defines the exact same global shape keeps the web contract byte-for-byte
/// identical to what already ships today, and to what's mock-tested in the
/// print queue.
class MainViewController: CAPBridgeViewController, WKScriptMessageHandler {

    private let printerBridge = PrinterBridge()

    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        guard let webView = self.webView else {
            // Should never happen post-capacitorDidLoad — if it does, the
            // page will simply see printerBridgeAvailable()/
            // cashDrawerBridgeAvailable() return false, same as today's
            // plain-browser fallback. No crash either way.
            return
        }

        let controller = webView.configuration.userContentController
        controller.add(self, name: "androidPrintBridge")
        controller.add(self, name: "nativeCashDrawerBridge")

        let script = WKUserScript(
            source: Self.bridgeInjectionJS,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        controller.addUserScript(script)
    }

    // MARK: - WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let callbackId = body["callbackId"] as? String,
              let ip = body["ip"] as? String,
              let port = body["port"] as? Int else {
            return
        }

        switch message.name {
        case "androidPrintBridge":
            guard let base64 = body["base64"] as? String,
                  let bytes = Data(base64Encoded: base64) else {
                self.respond(callbackId: callbackId, ok: false, error: "render_failed", jsCallback: "__androidPrintCallback")
                return
            }
            printerBridge.send(bytes: bytes, ip: ip, port: UInt16(port)) { [weak self] ok, error in
                self?.respond(callbackId: callbackId, ok: ok, error: error, jsCallback: "__androidPrintCallback")
            }

        case "nativeCashDrawerBridge":
            // Standard ESC/POS drawer-kick sequence (see
            // docs/ios-native-bridge-interfaces.md §2's "minimum viable fix"
            // note) — sent as its own short byte sequence to the same
            // ip:port a printer would use.
            let kickBytes = Data([0x1B, 0x70, 0x00, 0x19, 0xFA])
            printerBridge.send(bytes: kickBytes, ip: ip, port: UInt16(port)) { [weak self] ok, error in
                self?.respond(callbackId: callbackId, ok: ok, error: error, jsCallback: "__nativeCashDrawerCallback")
            }

        default:
            break
        }
    }

    private func respond(callbackId: String, ok: Bool, error: String?, jsCallback: String) {
        guard let webView = self.webView else { return }
        let resultJSON: String
        if ok {
            resultJSON = "{ok:true}"
        } else {
            let escaped = (error ?? "unknown_error").replacingOccurrences(of: "'", with: "\\'")
            resultJSON = "{ok:false,error:'\(escaped)'}"
        }
        let js = "window.\(jsCallback) && window.\(jsCallback)('\(callbackId)', \(resultJSON));"
        DispatchQueue.main.async {
            webView.evaluateJavaScript(js, completionHandler: { (_: Any?, _: Error?) in })
        }
    }

    // MARK: - Injected JS

    /// Mirrors docs/ios-native-bridge-interfaces.md §1/§2 exactly.
    /// isAvailable() is answered synchronously and locally (true) — per the
    /// doc, it means "this app has a working ESC/POS transport layer
    /// available", a static fact about which shell is running the page, not
    /// whether a printer IP happens to be configured (that check already
    /// lives entirely in the web layer's DEVICE.printerIp). No native
    /// round-trip is needed to answer it.
    private static let bridgeInjectionJS = """
    (function(){
      window.AndroidPrint = {
        isAvailable: function(){ return true; },
        printRaw: function(base64Bytes, ip, port, callbackId){
          window.webkit.messageHandlers.androidPrintBridge.postMessage({
            base64: base64Bytes, ip: ip, port: port, callbackId: callbackId
          });
        }
      };
      window.NativeCashDrawer = {
        isAvailable: function(){ return true; },
        kick: function(ip, port, callbackId){
          window.webkit.messageHandlers.nativeCashDrawerBridge.postMessage({
            ip: ip, port: port, callbackId: callbackId
          });
        }
      };
    })();
    """
}
