import Foundation
import Network

/// Ported from ios/App/App/NetworkPrinterTransport.swift (the Capacitor
/// project's already CI-proven raw-TCP ESC/POS transport) — this class has
/// zero Capacitor/WKWebView dependency in its original form (pure
/// Foundation + Network.framework), so it moves into this React Native
/// module unchanged in logic. Only the caller (RakeenPrinterModule.swift,
/// an RN NativeModule, instead of MainViewController's
/// WKScriptMessageHandler) is different — exactly the "transport logic
/// reusable, bridging mechanism rewritten" finding from
/// docs/react-native-poc/phase1-audit.md.
///
/// UNVERIFIED beyond compilation: never run against a real printer or a
/// real device from this POC. See docs/react-native-poc/phase4-ios.md.
final class NetworkPrinterTransport {

    private let connectTimeoutSeconds: TimeInterval

    init(timeoutSeconds: TimeInterval = 6) {
        self.connectTimeoutSeconds = timeoutSeconds
    }

    func send(bytes: Data, host: String, port: UInt16, completion: @escaping (Bool, String?) -> Void) {
        guard let nwPort = NWEndpoint.Port(rawValue: port) else {
            completion(false, "invalid_port")
            return
        }

        let connection = NWConnection(host: NWEndpoint.Host(host), port: nwPort, using: .tcp)
        let queue = DispatchQueue(label: "com.rakeen.poc.printertransport.network")

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
                finish(false, "connection_cancelled")
            default:
                break
            }
        }

        connection.start(queue: queue)
    }

    /// Just a connectivity probe (open + immediately cancel) for
    /// `testConnection` — measures real latency to open the socket rather
    /// than claiming a printer is "online" from a ping alone (ICMP reachability
    /// and "will accept a TCP print job" are not the same guarantee).
    func testConnection(host: String, port: UInt16, completion: @escaping (Bool, Double?, String?) -> Void) {
        guard let nwPort = NWEndpoint.Port(rawValue: port) else {
            completion(false, nil, "invalid_port")
            return
        }
        let start = Date()
        let connection = NWConnection(host: NWEndpoint.Host(host), port: nwPort, using: .tcp)
        let queue = DispatchQueue(label: "com.rakeen.poc.printertransport.test")

        var finished = false
        let finish: (Bool, Double?, String?) -> Void = { ok, latency, error in
            guard !finished else { return }
            finished = true
            connection.cancel()
            completion(ok, latency, error)
        }

        let timeoutWorkItem = DispatchWorkItem {
            finish(false, nil, "connection_timeout")
        }
        queue.asyncAfter(deadline: .now() + connectTimeoutSeconds, execute: timeoutWorkItem)

        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                timeoutWorkItem.cancel()
                let latencyMs = Date().timeIntervalSince(start) * 1000
                finish(true, latencyMs, nil)
            case .failed(let error):
                timeoutWorkItem.cancel()
                finish(false, nil, NetworkPrinterTransport.describeError(error))
            default:
                break
            }
        }

        connection.start(queue: queue)
    }

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
