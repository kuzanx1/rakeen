package com.rakeenpoc

import android.content.pm.PackageManager
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

/**
 * The app's own version, and who installed it.
 *
 * Used by src/application/appUpdateService.ts: a copy from the direct link
 * (rakeenapp.com/android) never updates itself, so the cashier is told when
 * /api/app-version has a newer versionCode. Copies from Google Play
 * (installer "com.android.vending") are left to Play -- the direct APK is
 * signed with a different key and would not install over them anyway.
 * Also tells reviewService whether Play's in-app review can work here.
 */
class RakeenAppInfoModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "RakeenAppInfoModule"

    override fun getConstants(): Map<String, Any?> {
        val ctx = reactApplicationContext
        var versionCode = 0L
        var versionName = ""
        try {
            val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ctx.packageManager.getPackageInfo(ctx.packageName, PackageManager.PackageInfoFlags.of(0))
            } else {
                @Suppress("DEPRECATION")
                ctx.packageManager.getPackageInfo(ctx.packageName, 0)
            }
            versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else {
                @Suppress("DEPRECATION")
                info.versionCode.toLong()
            }
            versionName = info.versionName ?: ""
        } catch (e: Exception) {
            // Unknown version: the update check stays quiet.
        }
        val installer: String? = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                ctx.packageManager.getInstallSourceInfo(ctx.packageName).installingPackageName
            } else {
                @Suppress("DEPRECATION")
                ctx.packageManager.getInstallerPackageName(ctx.packageName)
            }
        } catch (e: Exception) {
            null
        }
        return mapOf(
            "versionCode" to versionCode.toDouble(),
            "versionName" to versionName,
            "installer" to installer,
        )
    }
}
