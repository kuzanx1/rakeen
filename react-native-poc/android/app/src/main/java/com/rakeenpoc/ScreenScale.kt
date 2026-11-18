package com.rakeenpoc

import android.content.res.Resources
import kotlin.math.min

/**
 * شاشات الكاشير الكبيرة (مثل R10a، 15.6 إنش 1920x1080) تجي بكثافة
 * منخفضة (160dpi)، فأندرويد يعطي التطبيق 1920x1080 dp كاملة، وتطلع
 * المنتجات والأزرار والخط صغيرة جداً في زاوية الشاشة. عميل «طارق» اشتكى
 * إنه ما يشوف المنتجات زين.
 *
 * الحل: لو أصغر بُعد للشاشة أكبر من BIG_SW_DP، نرفع الكثافة لين يصير
 * أصغر بُعد TARGET_SW_DP. فالواجهة كلها تكبر بنفس النسبة (1080 → 720 =
 * ×1.5)، وتبقى بنفس تخطيط التابلت المعتاد. الجوالات والتابلتات العادية
 * (أصغر بُعد أقل من 900dp) ما تتغير أبداً.
 *
 * لازم تنطبق قبل ما React Native يقرأ المقاييس (Application.onCreate قبل
 * loadReactNative)، وعلى موارد النشاط، وبعد أي تغيير إعدادات لأن أندرويد
 * يرجّع المقاييس الأصلية. شاشة العميل الخلفية (Presentation) لها سياق
 * خاص فما تتأثر.
 */
object ScreenScale {
  private const val BIG_SW_DP = 900f
  private const val TARGET_SW_DP = 720f

  fun apply(res: Resources) {
    val sys = Resources.getSystem().displayMetrics
    val swPx = min(sys.widthPixels, sys.heightPixels).toFloat()
    if (sys.density <= 0f || swPx / sys.density < BIG_SW_DP) return
    val density = swPx / TARGET_SW_DP
    val fontScale = res.configuration.fontScale
    val dm = res.displayMetrics
    dm.density = density
    @Suppress("DEPRECATION")
    dm.scaledDensity = density * fontScale
    dm.densityDpi = (density * 160f).toInt()
  }
}
