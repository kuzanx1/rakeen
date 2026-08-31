import Foundation

/// UNVERIFIED DRAFT — never compiled (well, PrinterTransport itself is new
/// this pass; NetworkPrinterTransport's actual socket logic already
/// compiled successfully in CI before this refactor, see
/// docs/windows-complete-mac-required.md).
///
/// Introduced so Rakeen's print system is a multi-printer architecture, not
/// code hard-wired to one model. The first real hardware target is a
/// SUNMI/Goodics NT310 (80mm kitchen cloud printer, LAN/Ethernet) — but
/// Rakeen's merchants use many different printer brands/models/connections,
/// so nothing about this layer, or `PrinterManager`, is NT310-specific.
/// See docs/ios-native-bridge-interfaces.md §4 for the per-model/per-
/// transport Verified/Ready-for-Testing/Unsupported classification this
/// abstraction is designed to make honest, not aspirational.
///
/// Shape: PrintQueue (web, unchanged) → PrinterManager → PrinterTransport
/// (this protocol) → physical printer. The web-side Print Queue
/// (`rakeen-pos.js`) and the bridge contract it calls
/// (`window.AndroidPrint`/`window.NativeCashDrawer`) do not know or care
/// which transport handles a job — that decision is made entirely on the
/// native side, in `PrinterManager`.
protocol PrinterTransport {
    func send(bytes: Data, to target: PrinterTarget, completion: @escaping (Bool, String?) -> Void)
}

/// Which physical transport a print/drawer job should go over.
///
/// Only `.network` has a real implementation
/// (`NetworkPrinterTransport`) — `.bluetooth`/`.usb` are declared here so
/// the shape of the system supports them, NOT because they're implemented.
/// See docs/ios-native-bridge-interfaces.md §4 before assuming either is
/// usable: Bluetooth Classic in particular is very likely impossible
/// without MFi certification, per Apple platform constraints, and BLE/USB
/// both require genuinely new native code (CoreBluetooth/
/// ExternalAccessory), not just a new case here.
enum PrinterTransportKind {
    case network
    case bluetooth
    case usb
}

/// Everything a transport needs to reach one specific printer for one
/// specific job. `ip`/`port` are the only fields with real data today,
/// because the web-side bridge contract
/// (docs/ios-native-bridge-interfaces.md §1/§2) only ever sends ip/port —
/// there is currently no way for the web layer to express "this job is for
/// a Bluetooth/USB printer". Adding that is a future, additive change to
/// the bridge contract (new fields on the existing `printRaw`/`kick`
/// message), not a rewrite of the Print Queue — see `PrinterManager` for
/// where that would plug in.
struct PrinterTarget {
    let transport: PrinterTransportKind
    let ip: String?
    let port: UInt16?
}

/// Extensible shape for a configured printer — Brand/Model/Transport/
/// host/Port/Paper width/Protocol/Capabilities, per the multi-printer
/// readiness pass. **Not constructed or consumed anywhere in the live code
/// path today** — `PrinterManager.send(bytes:ip:port:completion:)` (the
/// one real, live entry point, matching `DEVICE.printerIp`/`printerPort`
/// from rakeen-pos.js exactly, unchanged) doesn't take a profile and
/// doesn't need to, because for any ESC/POS-compatible network printer the
/// native layer has nothing model-specific left to decide — the web layer
/// (`renderReceiptCanvas`/`canvasToEscPosRaster` in rakeen-pos.js) already
/// rasterizes the entire receipt (Arabic text included) into a bitmap and
/// hands the native side finished, opaque bytes, and `DEVICE.printerIp`/
/// `printerPort`/`printerPaperWidth` (plus the separate
/// `kitchenPrinterIp`/`kitchenPrinterPort` pair already used for a second
/// network printer today) already give the web layer everything it needs
/// per-printer.
///
/// This type exists so that if/when a real need arises — a specific
/// printer model whose drawer-kick bytes differ from the standard default
/// (see `MainViewController`'s `nativeCashDrawerBridge` case), or a native
/// settings UI that wants to remember more than ip/port per printer — the
/// shape to hold that data already exists without a redesign. Adding a
/// second *brand/model* of network printer today requires none of this: it
/// already works with zero code changes, because `NetworkPrinterTransport`
/// only ever needs an ip/port and a byte array (see
/// docs/ios-native-bridge-interfaces.md §4/§5's "Multi-Printer Readiness"
/// section for the full reasoning).
struct PrinterProfile {
    let brand: String?
    let model: String?
    let transport: PrinterTransportKind
    /// IP address or resolvable hostname. Matches `DEVICE.printerIp`/
    /// `kitchenPrinterIp` in rakeen-pos.js today.
    let host: String?
    let port: UInt16?
    /// e.g. 58 or 80 — matches `DEVICE.printerPaperWidth`'s already-existing
    /// options in rakeen-pos.js (only meaningful to the web layer's canvas
    /// rendering; the native layer never reads this, it only ever sees the
    /// already-rendered bytes).
    let paperWidthMM: Int?
    let printProtocol: PrinterProtocolKind
    let capabilities: PrinterCapabilities
    let status: PrinterSupportStatus
}

/// The byte-level protocol a printer speaks. Only `.escPos` exists today —
/// it's the only protocol the web layer's byte-encoding
/// (`canvasToEscPosRaster` in rakeen-pos.js) targets. A printer needing a
/// genuinely different protocol (e.g. ZPL for label printers) would need
/// both new web-side encoding and a case here — out of scope until a real
/// printer actually needs it.
enum PrinterProtocolKind {
    case escPos
}

/// Per-printer overrides for the handful of things that are NOT already
/// fully decided by the web layer. Both fields currently unused —
/// `NetworkPrinterTransport` always sends the standard cut command (baked
/// into the web-generated byte stream) and `MainViewController` always
/// sends the standard drawer-kick sequence. Exists so a real hardware
/// finding (a specific model needing different bytes) has somewhere to go
/// other than a hardcoded special case.
struct PrinterCapabilities {
    let supportsCut: Bool
    let supportsCashDrawerKick: Bool
}

enum PrinterSupportStatus {
    /// Confirmed working against real hardware in this exact app.
    case verified
    /// Code exists and is believed correct (protocol/port confirmed via
    /// vendor documentation or a real third-party integration guide for
    /// the same/sibling model) but has not been run against this exact
    /// physical unit yet.
    case readyForTesting
    /// Either not implemented (no transport code exists) or known/likely
    /// impossible on this platform (e.g. non-MFi Bluetooth Classic).
    case unsupported
}
