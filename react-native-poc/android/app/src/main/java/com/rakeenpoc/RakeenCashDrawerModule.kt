package com.rakeenpoc

import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

/** Standard ESC/POS drawer-kick sequence (pin 2, ~25ms/250ms timing) --
 *  same near-universal default as ios/RakeenPOC/RakeenCashDrawerModule.swift
 *  and the Capacitor project's MainViewController.swift. Overridable via
 *  kickCommandBase64 (see react-native-poc/src/platform/cashDrawer.ts) but
 *  never overridden anywhere yet -- no real hardware has required
 *  different bytes. */
private val DEFAULT_KICK_COMMAND = byteArrayOf(0x1B, 0x70, 0x00, 0x19.toByte(), 0xFA.toByte())
/** The fixed address every SUNMI terminal gives its built-in printer. */
private const val SUNMI_INNER_PRINTER = "00:11:22:33:44:55"
private val SUNMI_DRAWER_COMMAND = byteArrayOf(0x10, 0x14, 0x00, 0x00, 0x00)

class RakeenCashDrawerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val transport = NetworkPrinterTransport()
    private val bluetoothTransport = BluetoothClassicPrinterTransport(reactContext)
    private val usbTransport = UsbPrinterTransport(reactContext)

    override fun getName() = "RakeenCashDrawerModule"

    /** SUNMI's built-in printer: its fixed address, or failing that its
     *  paired name, since not every model is known to keep the address. */
    private fun isSunmiInnerPrinter(bluetoothId: String): Boolean {
        if (bluetoothId.equals(SUNMI_INNER_PRINTER, ignoreCase = true)) return true
        return try {
            @Suppress("MissingPermission")
            android.bluetooth.BluetoothAdapter.getDefaultAdapter()
                ?.getRemoteDevice(bluetoothId)?.name?.contains("InnerPrinter", ignoreCase = true) == true
        } catch (e: Exception) {
            false
        }
    }

    /** options: { target: { transport, host?, port?, bluetoothId?, usbAccessoryId? },
     *  kickCommandBase64?: String, operationId: String, timeoutMs: Int }.
     *  `operationId` is accepted but intentionally NOT used for dedup here
     *  -- double-kick protection is enforced JS-side in openCashDrawer()
     *  (react-native-poc/src/platform/cashDrawer.ts); this native method
     *  always executes exactly one kick per invocation. Feature Parity
     *  Pass -- Bluetooth/USB: the kick travels over whichever transport
     *  the configured printer uses, same principle as iOS's
     *  RakeenCashDrawerModule.swift. */
    @ReactMethod
    fun open(options: ReadableMap, promise: Promise) {
        val target = if (options.hasKey("target")) options.getMap("target") else null
        if (target == null) {
            resolveInvalidTarget(promise)
            return
        }
        val bytes = if (options.hasKey("kickCommandBase64") && !options.isNull("kickCommandBase64")) {
            try {
                Base64.decode(options.getString("kickCommandBase64"), Base64.DEFAULT)
            } catch (e: IllegalArgumentException) {
                DEFAULT_KICK_COMMAND
            }
        } else {
            DEFAULT_KICK_COMMAND
        }
        val timeoutMs = if (options.hasKey("timeoutMs")) options.getInt("timeoutMs") else 8000
        val transportKind = if (target.hasKey("transport")) target.getString("transport") else "network"

        when (transportKind) {
            "bluetooth" -> {
                val bluetoothId = if (target.hasKey("bluetoothId")) target.getString("bluetoothId") else null
                if (bluetoothId == null) { resolveInvalidTarget(promise); return }
                if (!isSunmiInnerPrinter(bluetoothId)) {
                    bluetoothTransport.send(bluetoothId, bytes) { ok, errorDetail -> resolveOpenResult(promise, ok, errorDetail) }
                    return
                }
                // A SUNMI desktop's drawer hangs off the terminal, not a printer
                // pulse pin: it opens on DLE DC4 (SUNMI's documented raw
                // command). Over the Bluetooth InnerPrinter the D2 mini's
                // drawer stayed shut, so SUNMI's own printer service goes
                // first, and Bluetooth stays the fallback for a terminal
                // without it.
                val sunmiBytes = bytes + SUNMI_DRAWER_COMMAND
                // route: which way the command went, shown under the manual
                // «فتح الدرج» message while the D2 mini drawer is diagnosed.
                SunmiPrinterService.sendRaw(reactApplicationContext, sunmiBytes, 2500L) { ok, info ->
                    if (ok) resolveOpenResult(promise, true, null, "sunmi " + info)
                    else bluetoothTransport.send(bluetoothId, sunmiBytes) { btOk, errorDetail ->
                        resolveOpenResult(promise, btOk, errorDetail, "sunmi(" + info + ") -> bluetooth")
                    }
                }
            }
            "usb" -> {
                val usbAccessoryId = if (target.hasKey("usbAccessoryId")) target.getString("usbAccessoryId") else null
                if (usbAccessoryId == null) { resolveInvalidTarget(promise); return }
                usbTransport.send(usbAccessoryId, bytes, timeoutMs) { ok, errorDetail -> resolveOpenResult(promise, ok, errorDetail) }
            }
            else -> {
                val host = if (target.hasKey("host")) target.getString("host") else null
                val port = if (target.hasKey("port")) target.getInt("port") else -1
                if (host == null || port <= 0) { resolveInvalidTarget(promise); return }
                transport.send(host, port, bytes) { ok, errorDetail -> resolveOpenResult(promise, ok, errorDetail) }
            }
        }
    }

    private fun resolveInvalidTarget(promise: Promise) {
        val result = Arguments.createMap()
        result.putBoolean("ok", false)
        result.putString("error", "INVALID_TARGET")
        promise.resolve(result)
    }

    private fun resolveOpenResult(promise: Promise, ok: Boolean, errorDetail: String?, route: String? = null) {
        val result = Arguments.createMap()
        result.putBoolean("ok", ok)
        if (route != null) result.putString("route", route)
        if (errorDetail != null) {
            result.putString("error", if (errorDetail == "permission_denied") "PERMISSION_DENIED" else "PRINTER_CONNECTION_FAILED")
            result.putString("errorDetail", errorDetail)
        }
        promise.resolve(result)
    }

    @ReactMethod
    fun getCapabilities(promise: Promise) {
        val result = Arguments.createMap()
        result.putBoolean("supported", true)
        promise.resolve(result)
    }
}
