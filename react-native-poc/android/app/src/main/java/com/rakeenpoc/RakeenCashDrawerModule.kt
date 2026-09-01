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

class RakeenCashDrawerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val transport = NetworkPrinterTransport()
    private val bluetoothTransport = BluetoothClassicPrinterTransport(reactContext)
    private val usbTransport = UsbPrinterTransport(reactContext)

    override fun getName() = "RakeenCashDrawerModule"

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
                bluetoothTransport.send(bluetoothId, bytes) { ok, errorDetail -> resolveOpenResult(promise, ok, errorDetail) }
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

    private fun resolveOpenResult(promise: Promise, ok: Boolean, errorDetail: String?) {
        val result = Arguments.createMap()
        result.putBoolean("ok", ok)
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
