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

/// Deliberately minimal today. A per-model "capabilities" profile (paper
/// width, cut support, codepage, etc.) is NOT built out here because the
/// web layer (`renderReceiptCanvas`/`canvasToEscPosRaster` in
/// rakeen-pos.js) already owns 100% of those decisions — it rasterizes the
/// entire receipt (Arabic text included) into a bitmap and hands the
/// native side finished, opaque bytes. The native layer has nothing
/// model-specific left to decide for any ESC/POS-compatible printer; it
/// only needs to know how to *reach* the device (this struct) and that its
/// transport is actually implemented and tested (see the Hardware
/// Compatibility Matrix). If a future printer needs native-side
/// model-specific behavior (e.g. a genuinely different protocol, not
/// ESC/POS), that would be a new `PrinterTransport` conformance, not a
/// change here.
struct PrinterProfile {
    let modelName: String
    let transport: PrinterTransportKind
    let status: PrinterSupportStatus
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
