package com.rakeenpoc

import android.content.res.Configuration
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "RakeenPOC"

  // تكبير الشاشات الكبيرة (ScreenScale): على موارد النشاط والتطبيق، وبعد
  // أي تغيير إعدادات لأن أندرويد يرجّع المقاييس الأصلية.
  override fun onCreate(savedInstanceState: Bundle?) {
    ScreenScale.apply(resources)
    ScreenScale.apply(application.resources)
    super.onCreate(savedInstanceState)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    ScreenScale.apply(resources)
    ScreenScale.apply(application.resources)
    super.onConfigurationChanged(newConfig)
  }

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
