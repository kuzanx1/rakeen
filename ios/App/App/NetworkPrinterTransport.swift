import Foundation
import Network

/// The one real, implemented `PrinterTransport` — raw ESC/POS bytes over a
/// plain TCP socket, using `Network.framework` (not a third-party ESC/POS
/// SDK), since the web side already finishes 100% of the ESC/POS byte
/// encoding before handing bytes here. This is the same logic that
/// compiled successfully in CI as `PrinterBridge` before this refactor
/// (docs/windows-complete-mac-required.md) — only reshaped to conform to
/// `PrinterTransport` so `PrinterManager` can address it uniformly
/// alongside future Bluetooth/USB transports. No behavior change.
///
/// First real hardware target: SUNMI/Goodics NT310 (80mm kitchen cloud
/// printer), reachable via its Ethernet/LAN port. Port 9100 is the
/// industry-standard raw/JetDirect ESC/POS printing port and is what a
/// real third-party POS integration guide documents for the NT310's sibling
/// model (NT311, same product family/firmware line) — Sunmi's own NT310
/// manual confirms LAN/TCP-IP connectivity and an ESC/POS-compatible
/// self-test report but does not itself state the port number. Classified
/// **Ready for Testing**, not Verified, until confirmed against the real
/// unit — see docs/ios-native-bridge-interfaces.md §4 and
/// docs/ios-nt310-test-plan.md.
final class NetworkPrinterTransport: PrinterTransport {

    /// Per-attempt timeout. The web side already imposes its own 8s timeout
    /// per docs/ios-native-bridge-interfaces.md §1, and tolerates a late
    /// callback with no crash — this native-side timeout exists only so a
    /// hung TCP connection doesn't leak indefinitely, not to race the web
    /// layer's own timer.
    private let connectTimeoutSeconds: TimeInterval = 6

    func send(bytes: Data, to target: PrinterTarget, completion: @escaping (Bool, String?) -> Void) {
        guard target.transport == .network else {
            completion(false, "unsupported_transport")
            return
        }
        guard let ip = target.ip, let port = target.port else {
            completion(false, "invalid_target")
            return
        }
        guard let nwPort = NWEndpoint.Port(rawValue: port) else {
            completion(false, "invalid_port")
            return
        }

        let connection = NWConnection(host: NWEndpoint.Host(ip), port: nwPort, using: .tcp)
        let queue = DispatchQueue(label: "com.rakeen.cashier.printertransport.network")

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
                        finish(false, NetworkPrinterTransport.describeError(error))
                    } else {
                        finish(true, nil)
                    }
                }))
            case .failed(let error):
                timeoutWorkItem.cancel()
                finish(false, NetworkPrinterTransport.describeError(error))
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
