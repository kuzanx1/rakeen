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

    override fun getName() = "RakeenCashDrawerModule"

    /** options: { target: { host, port }, kickCommandBase64?: String } */
    @ReactMethod
    fun open(options: ReadableMap, promise: Promise) {
        val target = if (options.hasKey("target")) options.getMap("target") else null
        val host = target?.let { if (it.hasKey("host")) it.getString("host") else null }
        val port = target?.let { if (it.hasKey("port")) it.getInt("port") else -1 } ?: -1

        if (host == null || port <= 0) {
            val result = Arguments.createMap()
            result.putBoolean("ok", false)
            result.putString("error", "invalid_target")
            promise.resolve(result)
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

        transport.send(host, port, bytes) { ok, error ->
            val result = Arguments.createMap()
            result.putBoolean("ok", ok)
            if (error != null) result.putString("error", error)
            promise.resolve(result)
        }
    }

    @ReactMethod
    fun capabilities(promise: Promise) {
        val result = Arguments.createMap()
        result.putBoolean("supported", true)
        promise.resolve(result)
    }
}
