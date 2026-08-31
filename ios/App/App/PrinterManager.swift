import Foundation

/// The one thing `MainViewController` talks to for printer/drawer jobs.
/// Owns transport selection so nothing upstream (the web-side Print Queue,
/// or `MainViewController`'s message handling) needs to know or care
/// whether a given printer is reached over Network, Bluetooth, or USB.
///
/// Shape: PrintQueue (web) → PrinterManager (here) → PrinterTransport →
/// physical printer. Adding a second real transport later means writing a
/// new `PrinterTransport` conformance and adding one case to
/// `transport(for:)` below — it does not mean touching
/// `MainViewController`, the web-side Print Queue, or the native bridge
/// contract's existing `printRaw`/`kick` message shape.
final class PrinterManager {

    private let networkTransport: PrinterTransport = NetworkPrinterTransport()
    // Future, once a real implementation exists (see
    // docs/ios-native-bridge-interfaces.md §4 — neither is implemented or
    // evaluated today, and BLE/USB both require genuinely new native code,
    // not just a case added here):
    // private let bluetoothTransport: PrinterTransport = BluetoothPrinterTransport()
    // private let usbTransport: PrinterTransport = USBPrinterTransport()

    /// Matches the existing web-side bridge contract exactly
    /// (docs/ios-native-bridge-interfaces.md §1) — `ip`/`port`, nothing
    /// else, because that's all the web layer can currently express. Every
    /// call today therefore targets `.network`; this is the one place that
    /// would need a real decision once the web contract is extended to
    /// express a Bluetooth/USB target (a future, additive change, not a
    /// Print Queue rewrite).
    func send(bytes: Data, ip: String, port: UInt16, completion: @escaping (Bool, String?) -> Void) {
        let target = PrinterTarget(transport: .network, ip: ip, port: port)
        guard let transport = transport(for: target.transport) else {
            completion(false, "unsupported_transport")
            return
        }
        transport.send(bytes: bytes, to: target, completion: completion)
    }

    private func transport(for kind: PrinterTransportKind) -> PrinterTransport? {
        switch kind {
        case .network:
            return networkTransport
        case .bluetooth, .usb:
            // Not implemented — see the Hardware Compatibility Matrix in
            // docs/ios-native-bridge-interfaces.md §4. Unreachable today
            // since `send(bytes:ip:port:completion:)` only ever constructs
            // a `.network` target, kept explicit rather than assumed so a
            // future caller gets a clear signal, not a silent fallback.
            return nil
        }
    }
}
