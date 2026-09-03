package com.rakeenpoc

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/** Registers the real native modules this POC proves the pattern with --
 *  see docs/react-native-poc/phase5-android.md. RakeenSoundModule joined
 *  them for the POS's tap/alert sounds, which have no JS-only equivalent
 *  (React Native has no WebAudio). */
class RakeenPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(
            RakeenPrinterModule(reactContext),
            RakeenCashDrawerModule(reactContext),
            RakeenDeviceModule(reactContext),
            RakeenSoundModule(reactContext),
        )
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
