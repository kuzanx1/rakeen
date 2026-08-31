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

    override fun getName() = "RakeenPrinterModule"

    /** job: { host: String, port: Int, escPosBase64: String, timeoutMs: Int }
     *  port is required -- never defaulted to 9100 here, matching the iOS
     *  side and docs/ios-native-bridge-interfaces.md section 4a's rule. */
    @ReactMethod
    fun print(job: ReadableMap, promise: Promise) {
        val host = if (job.hasKey("host")) job.getString("host") else null
        val port = if (job.hasKey("port")) job.getInt("port") else -1
        val base64 = if (job.hasKey("escPosBase64")) job.getString("escPosBase64") else null

        if (host == null || port <= 0 || base64 == null) {
            val result = Arguments.createMap()
            result.putBoolean("ok", false)
            result.putString("error", "invalid_target")
            promise.resolve(result)
            return
        }

        val bytes = try {
            Base64.decode(base64, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            val result = Arguments.createMap()
            result.putBoolean("ok", false)
            result.putString("error", "render_failed")
            promise.resolve(result)
            return
        }

        transport.send(host, port, bytes) { ok, error ->
            val result = Arguments.createMap()
            result.putBoolean("ok", ok)
            if (error != null) result.putString("error", error)
            promise.resolve(result)
        }
    }

    /** target: { host: String, port: Int } */
    @ReactMethod
    fun testConnection(target: ReadableMap, promise: Promise) {
        val host = if (target.hasKey("host")) target.getString("host") else null
        val port = if (target.hasKey("port")) target.getInt("port") else -1

        if (host == null || port <= 0) {
            val result = Arguments.createMap()
            result.putBoolean("reachable", false)
            result.putString("error", "invalid_target")
            promise.resolve(result)
            return
        }

        transport.testConnection(host, port) { reachable, latencyMs, error ->
            val result = Arguments.createMap()
            result.putBoolean("reachable", reachable)
            if (latencyMs != null) result.putDouble("latencyMs", latencyMs)
            if (error != null) result.putString("error", error)
            promise.resolve(result)
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
    fun capabilities(promise: Promise) {
        val result = Arguments.createMap()
        val transports = Arguments.createArray()
        transports.pushString("network")
        result.putArray("supportedTransports", transports)
        result.putBoolean("supportsCut", true)
        result.putBoolean("supportsCashDrawerKick", true)
        result.putInt("paperWidthPx", 576)
        promise.resolve(result)
    }
}
