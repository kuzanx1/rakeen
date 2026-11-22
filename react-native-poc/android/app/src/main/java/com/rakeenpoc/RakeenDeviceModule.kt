package com.rakeenpoc

import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Deliberately minimal -- exists only to prove the JS -> NativeModules ->
 *  Kotlin round trip works for a third module, not to become a real
 *  device-info API. See react-native-poc/src/platform/device.ts. */
class RakeenDeviceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "RakeenDeviceModule"

    /** Who installed the app: "com.android.vending" = Google Play, null =
     *  sideloaded (rakeenapp.com/android). Play builds must not point users
     *  to paying outside Play, like iOS (see src/platform/storeRules.ts). */
    override fun getConstants(): Map<String, Any?> = mapOf("installer" to installer())

    private fun installer(): String? = try {
        val pm = reactApplicationContext.packageManager
        val pkg = reactApplicationContext.packageName
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            pm.getInstallSourceInfo(pkg).installingPackageName
        } else {
            @Suppress("DEPRECATION")
            pm.getInstallerPackageName(pkg)
        }
    } catch (e: Exception) {
        null
    }

    @ReactMethod
    fun getInfo(promise: Promise) {
        val result = Arguments.createMap()
        result.putString("platform", "android")
        result.putString("osVersion", Build.VERSION.RELEASE)
        promise.resolve(result)
    }
}
