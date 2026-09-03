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
/// Every send now carries a TRACE back to JS. A build reported a job as
/// printed, with the right host and 61072 real bytes, while the listener
/// on that host saw no connection at all — and a "printed" badge derived
/// from `.contentProcessed` cannot distinguish "the printer got it" from
/// "the stack accepted it and it went somewhere else". The trace records
/// what the connection actually did, including the endpoint iOS really
/// bound and the interface it used, because a TestFlight build has no
/// console to print any of it to.
final class NetworkPrinterTransport {

    private let connectTimeoutSeconds: TimeInterval

    init(timeoutSeconds: TimeInterval = 6) {
        self.connectTimeoutSeconds = timeoutSeconds
    }

    /// Collects timestamped lines on the connection's own serial queue.
    private final class Trace {
        private let start = Date()
        private var lines: [String] = []
        func add(_ line: String) {
            let ms = Int(Date().timeIntervalSince(start) * 1000)
            lines.append("+\(ms)ms \(line)")
        }
        var all: [String] { lines }
    }

    /// The endpoint iOS ACTUALLY resolved and bound, not the one we asked
    /// for. `remote` proves whether the socket really points at the
    /// intended printer; `local` says which of the phone's own addresses
    /// it went out from, which is how a "connected" that never reaches the
    /// LAN shows itself; `iface` distinguishes wifi from cellular from a
    /// VPN tunnel.
    private static func describePath(_ connection: NWConnection) -> String {
        guard let path = connection.currentPath else { return "path=nil" }
        let local = path.localEndpoint.map { "\($0)" } ?? "?"
        let remote = path.remoteEndpoint.map { "\($0)" } ?? "?"
        let iface = path.availableInterfaces.first.map { "\($0.type)" } ?? "?"
        return "local=\(local) remote=\(remote) iface=\(iface) expensive=\(path.isExpensive) status=\(path.status)"
    }

    func send(bytes: Data, host: String, port: UInt16, completion: @escaping (Bool, String?, [String]) -> Void) {
        let trace = Trace()
        guard let nwPort = NWEndpoint.Port(rawValue: port) else {
            trace.add("invalid_port \(port)")
            completion(false, "invalid_port", trace.all)
            return
        }

        let connection = NWConnection(host: NWEndpoint.Host(host), port: nwPort, using: .tcp)
        let queue = DispatchQueue(label: "com.rakeen.poc.printertransport.network")
        trace.add("start host=\(host) port=\(port) bytes=\(bytes.count)")

        var finished = false
        let finish: (Bool, String?) -> Void = { ok, error in
            guard !finished else { return }
            finished = true
            trace.add("finish ok=\(ok) error=\(error ?? "-")")
            connection.cancel()
            completion(ok, error, trace.all)
        }

        let timeoutWorkItem = DispatchWorkItem {
            trace.add("timeout after \(self.connectTimeoutSeconds)s")
            finish(false, "connection_timeout")
        }
        queue.asyncAfter(deadline: .now() + connectTimeoutSeconds, execute: timeoutWorkItem)

        connection.stateUpdateHandler = { state in
            switch state {
            case .setup:
                trace.add("state=setup")
            case .waiting(let error):
                // The state that matters most for a silent failure: iOS
                // parks the connection here (rather than failing it) when
                // it cannot get a usable path — a denied Local Network
                // permission looks exactly like this. It is not terminal,
                // so without this line it never appeared anywhere.
                trace.add("state=waiting error=\(NetworkPrinterTransport.describeError(error)) \(NetworkPrinterTransport.describePath(connection))")
            case .preparing:
                trace.add("state=preparing")
            case .ready:
                trace.add("state=ready \(NetworkPrinterTransport.describePath(connection))")
                // isComplete/.finalMessage sends the data AND half-closes
                // the stream, so the peer gets a real EOF instead of
                // waiting on its own read timeout. It also removes the
                // question of whether cancel() races the payload:
                // `.contentProcessed` only means the stack took the bytes,
                // not that the peer received them, and 61KB cannot all be
                // on the wire at that moment — with the FIN queued behind
                // the data, the close cannot overtake it.
                connection.send(content: bytes, contentContext: .finalMessage, isComplete: true, completion: .contentProcessed({ error in
                    timeoutWorkItem.cancel()
                    if let error = error {
                        trace.add("send failed \(NetworkPrinterTransport.describeError(error))")
                        finish(false, NetworkPrinterTransport.describeError(error))
                    } else {
                        trace.add("contentProcessed ok bytes=\(bytes.count) \(NetworkPrinterTransport.describePath(connection))")
                        // `.contentProcessed` only says the stack took the
                        // bytes. Having half-closed above, a peer that
                        // actually read the stream closes its side, and
                        // that EOF arrives here as isComplete -- the one
                        // signal available from the device that something
                        // on the other end consumed the job, rather than
                        // the bytes merely leaving the app. Never allowed
                        // to fail a print: a printer that holds the socket
                        // open is normal, so the linger just expires.
                        let linger = DispatchWorkItem {
                            trace.add("no peer close observed within 2s -- bytes left the stack, delivery unconfirmed")
                            finish(true, nil)
                        }
                        queue.asyncAfter(deadline: .now() + 2, execute: linger)
                        connection.receive(minimumIncompleteLength: 1, maximumLength: 1) { data, _, isComplete, receiveError in
                            linger.cancel()
                            if let receiveError = receiveError {
                                trace.add("peer closed with \(NetworkPrinterTransport.describeError(receiveError))")
                            } else {
                                trace.add("peer eof isComplete=\(isComplete) replied=\(data?.count ?? 0)B -- stream consumed")
                            }
                            finish(true, nil)
                        }
                    }
                }))
            case .failed(let error):
                timeoutWorkItem.cancel()
                trace.add("state=failed \(NetworkPrinterTransport.describeError(error))")
                finish(false, NetworkPrinterTransport.describeError(error))
            case .cancelled:
                timeoutWorkItem.cancel()
                trace.add("state=cancelled")
                finish(false, "connection_cancelled")
            @unknown default:
                trace.add("state=unknown")
            }
        }

        connection.start(queue: queue)
    }

    /// Just a connectivity probe (open + immediately cancel) for
    /// `testConnection` — measures real latency to open the socket rather
    /// than claiming a printer is "online" from a ping alone (ICMP reachability
    /// and "will accept a TCP print job" are not the same guarantee).
    func testConnection(host: String, port: UInt16, completion: @escaping (Bool, Double?, String?, [String]) -> Void) {
        let trace = Trace()
        guard let nwPort = NWEndpoint.Port(rawValue: port) else {
            completion(false, nil, "invalid_port", trace.all)
            return
        }
        let start = Date()
        let connection = NWConnection(host: NWEndpoint.Host(host), port: nwPort, using: .tcp)
        let queue = DispatchQueue(label: "com.rakeen.poc.printertransport.test")
        trace.add("start host=\(host) port=\(port)")

        var finished = false
        let finish: (Bool, Double?, String?) -> Void = { ok, latency, error in
            guard !finished else { return }
            finished = true
            connection.cancel()
            completion(ok, latency, error, trace.all)
        }

        let timeoutWorkItem = DispatchWorkItem {
            trace.add("timeout")
            finish(false, nil, "connection_timeout")
        }
        queue.asyncAfter(deadline: .now() + connectTimeoutSeconds, execute: timeoutWorkItem)

        connection.stateUpdateHandler = { state in
            switch state {
            case .waiting(let error):
                trace.add("state=waiting error=\(NetworkPrinterTransport.describeError(error))")
            case .preparing:
                trace.add("state=preparing")
            case .ready:
                timeoutWorkItem.cancel()
                let latencyMs = Date().timeIntervalSince(start) * 1000
                trace.add("state=ready \(NetworkPrinterTransport.describePath(connection))")
                finish(true, latencyMs, nil)
            case .failed(let error):
                timeoutWorkItem.cancel()
                trace.add("state=failed \(NetworkPrinterTransport.describeError(error))")
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
            case .EPERM, .EACCES:
                // What a blocked Local Network permission surfaces as.
                return "permission_denied_local_network"
            default: return "connection_error_\(code.rawValue)"
            }
        default:
            return "connection_error"
        }
    }
}
