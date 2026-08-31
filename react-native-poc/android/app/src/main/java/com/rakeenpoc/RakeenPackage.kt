package com.rakeenpoc

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/** Registers the three real native modules this POC proves the pattern
 *  with -- see docs/react-native-poc/phase5-android.md. */
class RakeenPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(
            RakeenPrinterModule(reactContext),
            RakeenCashDrawerModule(reactContext),
            RakeenDeviceModule(reactContext),
        )
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
