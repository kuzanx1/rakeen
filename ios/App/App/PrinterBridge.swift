import Foundation
import Network

/// UNVERIFIED DRAFT — written on Windows, never compiled, never run against
/// a real printer or on a real device. Implements the raw-TCP-socket
/// transport described in docs/ios-native-bridge-interfaces.md §1 ("What
/// actually needs to be true in the Swift/Capacitor implementation"):
/// Network.framework, NOT a third-party ESC/POS SDK, since the web side
/// already finishes 100% of the ESC/POS byte encoding (including the
/// rasterized, pre-shaped Arabic receipt image) before handing bytes here.
///
/// Shared by both the printer bridge and the cash-drawer bridge — a drawer
/// kick is just a 5-byte ESC/POS command sent to the same ip:port as a
/// receipt printer (see MainViewController's "nativeCashDrawerBridge" case),
/// so one transport class covers both per the doc's "minimum viable fix"
/// note in §2.
final class PrinterBridge {

    /// Per-attempt timeout. The web side already imposes its own 8s timeout
    /// per docs/ios-native-bridge-interfaces.md §1, and tolerates a late
    /// callback with no crash — this native-side timeout exists only so a
    /// hung TCP connection doesn't leak indefinitely, not to race the web
    /// layer's own timer.
    private let connectTimeoutSeconds: TimeInterval = 6

    func send(bytes: Data, ip: String, port: UInt16, completion: @escaping (Bool, String?) -> Void) {
        guard let nwPort = NWEndpoint.Port(rawValue: port) else {
            completion(false, "invalid_port")
            return
        }

        let connection = NWConnection(host: NWEndpoint.Host(ip), port: nwPort, using: .tcp)
        let queue = DispatchQueue(label: "com.rakeen.cashier.printerbridge")

        var finished = false
        let finish: (Bool, String?) -> Void = { ok, error in
            guard !finished else { return }
            finished = true
            connection.cancel()
            completion(ok, error)
        }

        let timeoutWorkItem = DispatchWorkItem {
            finish(false, "connection_timeout")
        }
        queue.asyncAfter(deadline: .now() + connectTimeoutSeconds, execute: timeoutWorkItem)

        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                connection.send(content: bytes, completion: .contentProcessed({ error in
                    timeoutWorkItem.cancel()
                    if let error = error {
                        finish(false, PrinterBridge.describeError(error))
                    } else {
                        finish(true, nil)
                    }
                }))
            case .failed(let error):
                timeoutWorkItem.cancel()
                finish(false, PrinterBridge.describeError(error))
            case .cancelled:
                timeoutWorkItem.cancel()
                // If we reach here without `finished` already being true,
                // nothing else will ever resolve this attempt — report it
                // rather than leaving the web side's promise hanging (it has
                // its own 8s timeout as a backstop either way).
                finish(false, "connection_cancelled")
            default:
                break
            }
        }

        connection.start(queue: queue)
    }

    /// Deliberately NOT reusing the reserved strings ('bridge_unavailable',
    /// 'no_printer_configured', 'timeout') that docs/ios-native-bridge-
    /// interfaces.md §3.3 reserves for the web layer's own use — the doc's
    /// explicit design rule is that native failures get their own
    /// descriptive string so Diagnostics shows the real cause.
    private static func describeError(_ error: NWError) -> String {
        switch error {
        case .posix(let code):
            switch code {
            case .ECONNREFUSED: return "connection_refused"
            case .ETIMEDOUT: return "connection_timeout"
            case .EHOSTUNREACH, .ENETUNREACH: return "host_unreachable"
            default: return "connection_error_\(code.rawValue)"
            }
        default:
            return "connection_error"
        }
    }
}
