import Foundation
import CoreBluetooth

/// Feature Parity Pass -- Bluetooth/USB printing. Real CoreBluetooth (BLE)
/// transport for iOS -- the ONLY Bluetooth path iOS can offer a generic,
/// non-MFi-certified ESC/POS printer: classic Bluetooth SPP is restricted
/// by Apple to devices that have gone through External Accessory / MFi
/// certification, which no real Rakeen hardware has, so this deliberately
/// does not attempt classic Bluetooth at all on iOS (disclosed, not a gap
/// found later -- see docs referenced in printer.ts's own TRANSPORT_NOT_SUPPORTED
/// doc comment).
///
/// Deliberately makes NO vendor/model assumption about the printer: it does
/// not filter the scan by a specific service UUID (many cheap ESC/POS BLE
/// printers use different vendor-specific UUIDs, and hardcoding one would
/// silently exclude real hardware this project has never seen). Instead it
/// scans for ALL nearby BLE peripherals and, once one is selected and
/// connected, discovers ITS OWN services/characteristics and picks the
/// first characteristic that is actually writable -- a generic
/// "BLE serial passthrough" approach that works with the common shape of
/// these printers without baking in a specific manufacturer's UUID.
///
/// UNVERIFIED beyond compilation: never run against a real BLE peripheral.
/// Whether a specific real printer's writable characteristic accepts raw
/// ESC/POS bytes the way this assumes, whether its negotiated MTU is large
/// enough for the raster header some printers require in one write, and
/// whether inter-chunk pacing is needed at all, can only be confirmed on
/// real hardware -- this implements the real, documented CoreBluetooth
/// mechanics but never claims to have proven the actual printing behavior.
final class BluetoothPrinterTransport: NSObject {

    enum TransportError: String {
        case bluetoothUnavailable = "bluetooth_unavailable" // powered off / unsupported / unauthorized
        case permissionDenied = "permission_denied"
        case deviceNotFound = "device_not_found"
        case connectionTimeout = "connection_timeout"
        case noWritableCharacteristic = "no_writable_characteristic"
        case writeFailed = "write_failed"
    }

    private var centralManager: CBCentralManager!
    private let queue = DispatchQueue(label: "com.rakeen.poc.printertransport.bluetooth")

    // CoreBluetooth does not retain peripherals for you -- a real,
    // well-documented gotcha (an unretained CBPeripheral can silently drop
    // its delegate callbacks mid-connection). Every peripheral this class
    // has ever seen or connected to is kept here for the class's lifetime.
    private var knownPeripherals: [String: CBPeripheral] = [:]

    private var scanCompletion: (([BLEDiscoveredDevice], TransportError?) -> Void)?
    private var scanResults: [String: BLEDiscoveredDevice] = [:]
    private var scanTimeoutWorkItem: DispatchWorkItem?

    private var pendingStateWaiters: [() -> Void] = []

    private var connectCompletion: ((Result<CBPeripheral, TransportError>) -> Void)?
    private var connectTimeoutWorkItem: DispatchWorkItem?
    private var connectingPeripheralId: String?

    private var writeCompletion: ((Bool, String?) -> Void)?
    private var writeCharacteristic: CBCharacteristic?
    private var pendingChunks: [Data] = []

    override init() {
        super.init()
        centralManager = CBCentralManager(delegate: self, queue: queue, options: [CBCentralManagerOptionShowPowerAlertKey: false])
    }

    struct BLEDiscoveredDevice {
        let id: String
        let name: String?
        let rssi: Int
    }

    /// Waits (bounded by the caller's own timeout expectations) for the
    /// central manager to leave the transient `.unknown`/`.resetting`
    /// states before actually scanning/connecting -- CoreBluetooth throws
    /// away scan/connect calls made before `.poweredOn` is reached.
    private func whenReady(_ body: @escaping (CBManagerState) -> Void) {
        let state = centralManager.state
        if state != .unknown && state != .resetting {
            body(state)
            return
        }
        pendingStateWaiters.append { body(self.centralManager.state) }
    }

    func scan(timeoutMs: Int, completion: @escaping ([BLEDiscoveredDevice], TransportError?) -> Void) {
        queue.async {
            self.scanResults.removeAll()
            self.scanCompletion = completion
            self.whenReady { state in
                guard state == .poweredOn else {
                    let error: TransportError = (state == .unauthorized) ? .permissionDenied : .bluetoothUnavailable
                    self.finishScan(error: error)
                    return
                }
                self.centralManager.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
                let work = DispatchWorkItem { self.finishScan(error: nil) }
                self.scanTimeoutWorkItem = work
                self.queue.asyncAfter(deadline: .now() + .milliseconds(timeoutMs), execute: work)
            }
        }
    }

    private func finishScan(error: TransportError?) {
        centralManager.stopScan()
        scanTimeoutWorkItem?.cancel()
        scanTimeoutWorkItem = nil
        let results = Array(scanResults.values)
        let completion = scanCompletion
        scanCompletion = nil
        completion?(results, error)
    }

    /// Connects to a peripheral by its identifier -- either one already
    /// known from a scan this session, or (a real, documented
    /// CoreBluetooth mechanism) retrieved fresh by UUID after an app
    /// restart, without needing to re-scan first.
    private func connect(peripheralId: String, timeoutMs: Int, completion: @escaping (Result<CBPeripheral, TransportError>) -> Void) {
        queue.async {
            self.whenReady { state in
                guard state == .poweredOn else {
                    completion(.failure(state == .unauthorized ? .permissionDenied : .bluetoothUnavailable))
                    return
                }
                guard let uuid = UUID(uuidString: peripheralId) else {
                    completion(.failure(.deviceNotFound))
                    return
                }
                var peripheral = self.knownPeripherals[peripheralId]
                if peripheral == nil {
                    peripheral = self.centralManager.retrievePeripherals(withIdentifiers: [uuid]).first
                    if let p = peripheral { self.knownPeripherals[peripheralId] = p }
                }
                guard let target = peripheral else {
                    completion(.failure(.deviceNotFound))
                    return
                }
                target.delegate = self
                self.connectingPeripheralId = peripheralId
                self.connectCompletion = completion
                let work = DispatchWorkItem {
                    self.centralManager.cancelPeripheralConnection(target)
                    self.finishConnect(.failure(.connectionTimeout))
                }
                self.connectTimeoutWorkItem = work
                self.queue.asyncAfter(deadline: .now() + .milliseconds(timeoutMs), execute: work)
                self.centralManager.connect(target, options: nil)
            }
        }
    }

    private func finishConnect(_ result: Result<CBPeripheral, TransportError>) {
        connectTimeoutWorkItem?.cancel()
        connectTimeoutWorkItem = nil
        let completion = connectCompletion
        connectCompletion = nil
        connectingPeripheralId = nil
        completion?(result)
    }

    /// Full connect -> discover services -> discover characteristics ->
    /// find a writable one -> chunk-write `bytes` pipeline.
    func send(bytes: Data, peripheralId: String, timeoutMs: Int, completion: @escaping (Bool, String?) -> Void) {
        connect(peripheralId: peripheralId, timeoutMs: timeoutMs) { result in
            switch result {
            case .failure(let error):
                completion(false, error.rawValue)
            case .success(let peripheral):
                self.writeCompletion = completion
                self.pendingBytesToWrite[peripheral.identifier.uuidString] = bytes
                peripheral.discoverServices(nil)
            }
        }
    }

    private var pendingBytesToWrite: [String: Data] = [:]
    // Tracks how many of a peripheral's services still haven't reported
    // their characteristics back -- lets send() fail honestly with
    // noWritableCharacteristic once every service has been checked and
    // none had a writable one, instead of hanging forever with no
    // completion at all (a real bug in an earlier draft of this file).
    private var pendingServiceCount: [String: Int] = [:]

    func testConnection(peripheralId: String, timeoutMs: Int, completion: @escaping (Bool, Double?, String?) -> Void) {
        let start = Date()
        connect(peripheralId: peripheralId, timeoutMs: timeoutMs) { result in
            switch result {
            case .failure(let error):
                completion(false, nil, error.rawValue)
            case .success:
                let latencyMs = Date().timeIntervalSince(start) * 1000
                completion(true, latencyMs, nil)
            }
        }
    }

    /// The negotiated ATT MTU decides the real per-write payload size --
    /// never a hardcoded 20 bytes, since modern iOS/peripheral pairs
    /// usually negotiate much higher. `withoutResponse` matches most BLE
    /// printer characteristics (they rarely support write-with-response).
    private func writeChunked(_ data: Data, to peripheral: CBPeripheral, characteristic: CBCharacteristic) {
        let writeType: CBCharacteristicWriteType = characteristic.properties.contains(.writeWithoutResponse) ? .withoutResponse : .withResponse
        let maxLen = max(20, peripheral.maximumWriteValueLength(for: writeType))
        var chunks: [Data] = []
        var offset = 0
        while offset < data.count {
            let end = min(offset + maxLen, data.count)
            chunks.append(data.subdata(in: offset..<end))
            offset = end
        }
        pendingChunks = chunks
        writeCharacteristic = characteristic
        writeNextChunk(to: peripheral, writeType: writeType)
    }

    private func writeNextChunk(to peripheral: CBPeripheral, writeType: CBCharacteristicWriteType) {
        guard let characteristic = writeCharacteristic else { return }
        guard !pendingChunks.isEmpty else {
            let completion = writeCompletion
            writeCompletion = nil
            completion?(true, nil)
            return
        }
        let chunk = pendingChunks.removeFirst()
        peripheral.writeValue(chunk, for: characteristic, type: writeType)
        if writeType == .withoutResponse {
            // No delegate callback fires for .withoutResponse -- a short,
            // disclosed pacing delay between chunks is a common real-world
            // necessity for cheap BLE printer firmware with a small input
            // buffer; its exact safe value is UNVERIFIED without real
            // hardware, this is a reasonable, conservative default.
            queue.asyncAfter(deadline: .now() + .milliseconds(15)) {
                self.writeNextChunk(to: peripheral, writeType: writeType)
            }
        }
    }
}

extension BluetoothPrinterTransport: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        let waiters = pendingStateWaiters
        pendingStateWaiters.removeAll()
        waiters.forEach { $0() }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let id = peripheral.identifier.uuidString
        knownPeripherals[id] = peripheral
        let name = peripheral.name ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String)
        scanResults[id] = BLEDiscoveredDevice(id: id, name: name, rssi: RSSI.intValue)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        finishConnect(.success(peripheral))
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        finishConnect(.failure(.connectionTimeout))
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        // Only surfaces as a failure if a write was genuinely still
        // pending -- a disconnect after a completed write is normal.
        if writeCompletion != nil {
            let completion = writeCompletion
            writeCompletion = nil
            completion?(false, "disconnected_before_write_complete")
        }
    }
}

extension BluetoothPrinterTransport: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil, let services = peripheral.services, !services.isEmpty else {
            failNoWritableCharacteristic(for: peripheral)
            return
        }
        pendingServiceCount[peripheral.identifier.uuidString] = services.count
        services.forEach { peripheral.discoverCharacteristics(nil, for: $0) }
    }

    private func failNoWritableCharacteristic(for peripheral: CBPeripheral) {
        pendingServiceCount.removeValue(forKey: peripheral.identifier.uuidString)
        pendingBytesToWrite.removeValue(forKey: peripheral.identifier.uuidString)
        guard let completion = writeCompletion else { return }
        writeCompletion = nil
        completion(false, TransportError.noWritableCharacteristic.rawValue)
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        let id = peripheral.identifier.uuidString
        let writable = (error == nil ? service.characteristics : nil)?
            .first(where: { $0.properties.contains(.write) || $0.properties.contains(.writeWithoutResponse) })

        if let writable = writable, let bytes = pendingBytesToWrite.removeValue(forKey: id) {
            pendingServiceCount.removeValue(forKey: id)
            writeChunked(bytes, to: peripheral, characteristic: writable)
            return
        }

        // No writable characteristic on THIS service -- only fail the
        // whole write once every one of the peripheral's services has
        // been checked (pendingBytesToWrite may already be gone if a
        // different service's callback already claimed it, in which case
        // this is a no-op).
        let remaining = (pendingServiceCount[id] ?? 1) - 1
        if remaining <= 0 {
            pendingServiceCount.removeValue(forKey: id)
            if pendingBytesToWrite[id] != nil {
                failNoWritableCharacteristic(for: peripheral)
            }
        } else {
            pendingServiceCount[id] = remaining
        }
    }

    /// Only ever fires for a `.withResponse` write (CoreBluetooth never
    /// calls this back for `.withoutResponse` -- that path paces itself
    /// via the delay in writeNextChunk instead).
    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            let completion = writeCompletion
            writeCompletion = nil
            completion?(false, "write_error_\(error.localizedDescription)")
            return
        }
        writeNextChunk(to: peripheral, writeType: .withResponse)
    }
}
