package com.rakeenpoc

import android.content.Context
import android.content.res.Configuration
import android.content.res.Resources
import kotlin.math.min

/**
 * شاشات الكاشير الكبيرة (مثل R10a، 15.6 إنش 1920x1080) تجي بكثافة
 * منخفضة (160dpi)، فأندرويد يعطي التطبيق 1920x1080 dp وتطلع المنتجات
 * والخط صغيرة. لو أصغر بُعد فوق BIG_SW_DP نكبّر لين يصير TARGET_SW_DP
 * (1080 → 720 = ×1.5)، فتطلع الواجهة بمقاس التابلت المعتاد.
 *
 * 1.33 عدّلت displayMetrics باليد، فأي تحديث للموارد من النظام يرجّعها
 * لجزء من التطبيق دون الباقي، وعلى جهاز العميل صارت الضغطات ما تلمس
 * الأزرار (1.34 شالتها). هنا بالطريقة الرسمية: densityDpi في Configuration
 * عبر applyOverrideConfiguration / createConfigurationContext. النظام هو
 * اللي يحسب المقاييس منها ويحافظ عليها مع كل تحديث، فالرسم واللمس على
 * كثافة وحدة. الجوالات والتابلتات العادية ما تتغير.
 */
object ScreenScale {
  private const val BIG_SW_DP = 900f
  private const val TARGET_SW_DP = 720f

  /** الكثافة المطلوبة، أو null لو الشاشة عادية. */
  fun targetDensityDpi(): Int? {
    val sys = Resources.getSystem().displayMetrics
    if (sys.density <= 0f) return null
    val swPx = min(sys.widthPixels, sys.heightPixels).toFloat()
    if (swPx / sys.density < BIG_SW_DP) return null
    return (swPx / TARGET_SW_DP * 160f).toInt()
  }

  /** للنشاط: إعداد فيه الكثافة بس، لـ applyOverrideConfiguration. */
  fun overrideFor(): Configuration? {
    val dpi = targetDensityDpi() ?: return null
    return Configuration().apply { densityDpi = dpi }
  }

  /** للتطبيق: سياق بنفس الكثافة (React Native يقرأ المقاييس منه). */
  fun wrap(base: Context): Context {
    val dpi = targetDensityDpi() ?: return base
    val cfg = Configuration(base.resources.configuration).apply { densityDpi = dpi }
    return base.createConfigurationContext(cfg)
  }
}
