package com.rakeenpoc

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import android.util.Base64

/**
 * The real React Native NativeModule for printing on Android -- this is
 * what NativeModules.RakeenPrinterModule in
 * react-native-poc/src/platform/printer.ts resolves to on Android.
 * Registered via RakeenPackage.kt. Same JS-facing method names/shapes as
 * ios/RakeenPOC/RakeenPrinterModule.swift, deliberately -- that symmetry
 * IS the point of this whole POC (see docs/react-native-poc/phase2-architecture.md).
 *
 * UNVERIFIED beyond compilation -- never run against a real printer or a
 * real device. See docs/react-native-poc/phase5-android.md.
 */
class RakeenPrinterModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val transport = NetworkPrinterTransport()
    private val bluetoothTransport = BluetoothClassicPrinterTransport(reactContext)
    private val usbTransport = UsbPrinterTransport(reactContext)

    override fun getName() = "RakeenPrinterModule"

    /** job: { target: { transport, host?, port?, bluetoothId?, usbAccessoryId? },
     *  escPosBase64: String, timeoutMs: Int }. Feature Parity Pass --
     *  Bluetooth/USB: `target.transport` routes to the real classic-
     *  Bluetooth (RFCOMM) or USB host transport; network keeps its
     *  original host/port-required behavior unchanged, matching iOS. */
    @ReactMethod
    fun print(job: ReadableMap, promise: Promise) {
        val target = if (job.hasKey("target")) job.getMap("target") else job
        val base64 = if (job.hasKey("escPosBase64")) job.getString("escPosBase64") else null
        val timeoutMs = if (job.hasKey("timeoutMs")) job.getInt("timeoutMs") else 8000

        val bytes = base64?.let {
            try {
                Base64.decode(it, Base64.DEFAULT)
            } catch (e: IllegalArgumentException) {
                null
            }
        }
        if (bytes == null) {
            val result = Arguments.createMap()
            result.putBoolean("ok", false)
            result.putString("error", "RENDER_FAILED")
            promise.resolve(result)
            return
        }

        val transportKind = target?.let { if (it.hasKey("transport")) it.getString("transport") else null } ?: "network"
        when (transportKind) {
            "bluetooth" -> {
                val bluetoothId = target?.let { if (it.hasKey("bluetoothId")) it.getString("bluetoothId") else null }
                if (bluetoothId == null) {
                    resolveInvalidTarget(promise)
                    return
                }
                bluetoothTransport.send(bluetoothId, bytes) { ok, errorDetail ->
                    resolvePrintResult(promise, ok, errorDetail)
                }
            }
            "usb" -> {
                val usbAccessoryId = target?.let { if (it.hasKey("usbAccessoryId")) it.getString("usbAccessoryId") else null }
                if (usbAccessoryId == null) {
                    resolveInvalidTarget(promise)
                    return
                }
                usbTransport.send(usbAccessoryId, bytes, timeoutMs) { ok, errorDetail ->
                    resolvePrintResult(promise, ok, errorDetail)
                }
            }
            else -> {
                val host = target?.let { if (it.hasKey("host")) it.getString("host") else null }
                val port = target?.let { if (it.hasKey("port")) it.getInt("port") else -1 } ?: -1
                if (host == null || port <= 0) {
                    resolveInvalidTarget(promise)
                    return
                }
                transport.send(host, port, bytes) { ok, errorDetail ->
                    resolvePrintResult(promise, ok, errorDetail)
                }
            }
        }
    }

    private fun resolveInvalidTarget(promise: Promise) {
        val result = Arguments.createMap()
        result.putBoolean("ok", false)
        result.putString("error", "INVALID_TARGET")
        promise.resolve(result)
    }

    private fun resolvePrintResult(promise: Promise, ok: Boolean, errorDetail: String?) {
        val result = Arguments.createMap()
        result.putBoolean("ok", ok)
        if (errorDetail != null) {
            result.putString("error", if (errorDetail == "permission_denied") "PERMISSION_DENIED" else "PRINTER_CONNECTION_FAILED")
            result.putString("errorDetail", errorDetail)
        }
        promise.resolve(result)
    }

    /** target: { transport, host?, port?, bluetoothId?, usbAccessoryId? } */
    @ReactMethod
    fun testConnection(target: ReadableMap, promise: Promise) {
        val transportKind = if (target.hasKey("transport")) target.getString("transport") else "network"
        when (transportKind) {
            "bluetooth" -> {
                val bluetoothId = if (target.hasKey("bluetoothId")) target.getString("bluetoothId") else null
                if (bluetoothId == null) { resolveInvalidConnectionTest(promise); return }
                bluetoothTransport.testConnection(bluetoothId) { reachable, latencyMs, errorDetail ->
                    resolveConnectionTest(promise, reachable, latencyMs, errorDetail)
                }
            }
            "usb" -> {
                val usbAccessoryId = if (target.hasKey("usbAccessoryId")) target.getString("usbAccessoryId") else null
                if (usbAccessoryId == null) { resolveInvalidConnectionTest(promise); return }
                usbTransport.testConnection(usbAccessoryId) { reachable, latencyMs, errorDetail ->
                    resolveConnectionTest(promise, reachable, latencyMs, errorDetail)
                }
            }
            else -> {
                val host = if (target.hasKey("host")) target.getString("host") else null
                val port = if (target.hasKey("port")) target.getInt("port") else -1
                if (host == null || port <= 0) { resolveInvalidConnectionTest(promise); return }
                transport.testConnection(host, port) { reachable, latencyMs, errorDetail ->
                    resolveConnectionTest(promise, reachable, latencyMs, errorDetail)
                }
            }
        }
    }

    private fun resolveInvalidConnectionTest(promise: Promise) {
        val result = Arguments.createMap()
        result.putBoolean("reachable", false)
        result.putString("error", "INVALID_TARGET")
        promise.resolve(result)
    }

    private fun resolveConnectionTest(promise: Promise, reachable: Boolean, latencyMs: Double?, errorDetail: String?) {
        val result = Arguments.createMap()
        result.putBoolean("reachable", reachable)
        if (latencyMs != null) result.putDouble("latencyMs", latencyMs)
        if (errorDetail != null) {
            result.putString("error", if (errorDetail == "permission_denied") "PERMISSION_DENIED" else "PRINTER_CONNECTION_FAILED")
            result.putString("errorDetail", errorDetail)
        }
        promise.resolve(result)
    }

    /** transport: 'network' | 'bluetooth' | 'usb', timeoutMs: Int.
     *  'network' has no discovery concept -- always resolves an empty list,
     *  never an error (nothing went wrong, there's just nothing to scan). */
    @ReactMethod
    fun scanDevices(transportKind: String, timeoutMs: Int, promise: Promise) {
        when (transportKind) {
            "bluetooth" -> bluetoothTransport.scan(timeoutMs) { devices, error ->
                val result = Arguments.createMap()
                val list = Arguments.createArray()
                devices.forEach { d ->
                    val entry = Arguments.createMap()
                    entry.putString("id", d.id)
                    if (d.name != null) entry.putString("name", d.name) else entry.putNull("name")
                    list.pushMap(entry)
                }
                result.putArray("devices", list)
                if (error != null) result.putString("error", if (error == "permission_denied") "PERMISSION_DENIED" else "PRINTER_UNAVAILABLE")
                promise.resolve(result)
            }
            "usb" -> usbTransport.scan { devices ->
                val result = Arguments.createMap()
                val list = Arguments.createArray()
                devices.forEach { d ->
                    val entry = Arguments.createMap()
                    entry.putString("id", d.id)
                    if (d.name != null) entry.putString("name", d.name) else entry.putNull("name")
                    list.pushMap(entry)
                }
                result.putArray("devices", list)
                promise.resolve(result)
            }
            else -> {
                val result = Arguments.createMap()
                result.putArray("devices", Arguments.createArray())
                promise.resolve(result)
            }
        }
    }

    /** Honest per docs/ios-native-bridge-interfaces.md's known gap: no
     *  bidirectional ESC/POS status read-back exists on either platform
     *  yet -- always reports "unknown", never a fabricated "idle"/"ready". */
    @ReactMethod
    fun getStatus(promise: Promise) {
        val result = Arguments.createMap()
        result.putString("status", "unknown")
        promise.resolve(result)
    }

    @ReactMethod
    fun getCapabilities(promise: Promise) {
        val result = Arguments.createMap()
        val transports = Arguments.createArray()
        transports.pushString("network")
        transports.pushString("bluetooth")
        transports.pushString("usb")
        result.putArray("supportedTransports", transports)
        result.putBoolean("supportsCut", true)
        result.putBoolean("supportsCashDrawerKick", true)
        result.putInt("paperWidthPx", 576)
        promise.resolve(result)
    }
}
