package com.rakeenpoc

import android.animation.ValueAnimator
import android.app.Presentation
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.hardware.display.DisplayManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Display
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.animation.LinearInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * شاشة العميل في أجهزة سنمي ذات الشاشتين.
 *
 * أندرويد يكرر شاشة الكاشير على الشاشة الثانية ما دام ما فيه شي معروض
 * عليها -- فالزبون يشوف كل اللي يسويه الكاشير. Presentation (واجهة
 * أندرويد للشاشة الثانية) يعرض عليها واجهة مستقلة.
 *
 * الواجهة مرسومة بعناصر أندرويد نفسها لا بصفحة ويب: الويب في الشاشة
 * الثانية ياخذ كثافة الشاشة الأولى، فطلعت الهوية مزاحة لزاوية ومصغّرة.
 * العناصر هنا تقاس بمقاس الشاشة الثانية نفسها، فتجي في النص دايم.
 *
 * mode = "mirror" يرجّع التكرار، "brand" هوية المطعم (وعليها المبلغ
 * والباركود)، "image" صورة تملأ الشاشة.
 *
 * يرجع يعرض بنفسه لما يرجع التطبيق للواجهة (onHostResume)، لأن
 * Presentation مربوط بالنشاط ويختفي لو انبنى النشاط من جديد.
 */
class RakeenCustomerDisplayModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx), LifecycleEventListener {

    override fun getName() = "RakeenCustomerDisplay"

    private var presentation: CustomerPresentation? = null
    private var mode: String = "mirror"
    private var content: String = ""
    // تُحفظ عشان ترجع كما هي لو انبنت الشاشة من جديد.
    private var totalText: String = ""

    init {
        ctx.addLifecycleEventListener(this)
    }

    private fun secondDisplay(): Display? {
        val dm = ctx.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
        return dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION).firstOrNull()
    }

    @ReactMethod
    fun hasDisplay(promise: Promise) {
        promise.resolve(secondDisplay() != null)
    }

    @ReactMethod
    fun show(mode: String, content: String, promise: Promise) {
        this.mode = mode
        this.content = content
        UiThreadUtil.runOnUiThread {
            try {
                apply()
                promise.resolve(mode == "mirror" || presentation != null)
            } catch (e: Exception) {
                promise.reject("customer_display_error", e.message, e)
            }
        }
    }

    /** المبلغ المطلوب على الهوية. نص فاضي = يرجع للترحيب. */
    @ReactMethod
    fun total(text: String) {
        totalText = text
        UiThreadUtil.runOnUiThread { presentation?.setTotal(text) }
    }

    /** باركود (نص يتحوّل QR) بعنوانه ورسالته، ويختفي بعد secs ثانية. */
    @ReactMethod
    fun code(qrUrl: String, title: String, msg: String, secs: Double) {
        UiThreadUtil.runOnUiThread { presentation?.showCode(qrUrl, title, msg, secs.toLong()) }
    }

    @ReactMethod
    fun hideCode() {
        UiThreadUtil.runOnUiThread { presentation?.hideCode() }
    }

    /**
     * بيجر ركين: باركود الطلب برقمه، بجانب باركود الولاء إن ظهرا معاً.
     * secs = 0 يعني «لين يبدأ الطلب اللي بعده» -- يبقى إلى hidePager
     * (بسقف خمس دقائق لو ضاع الإخفاء). يُرسم محلّياً فيعمل والجهاز بلا نت.
     */
    @ReactMethod
    fun pager(qrUrl: String, number: String, secs: Double) {
        UiThreadUtil.runOnUiThread { presentation?.showPager(qrUrl, number, secs.toLong()) }
    }

    @ReactMethod
    fun hidePager() {
        UiThreadUtil.runOnUiThread { presentation?.hidePager() }
    }

    private fun apply() {
        presentation?.dismiss()
        presentation = null
        if (mode == "mirror") return
        val activity = ctx.currentActivity ?: return
        val display = secondDisplay() ?: return
        val p = CustomerPresentation(activity, display, mode, content)
        p.show()
        p.setTotal(totalText)
        presentation = p
    }

    override fun onHostResume() {
        if (mode != "mirror" && presentation == null) {
            UiThreadUtil.runOnUiThread {
                try {
                    apply()
                } catch (_: Exception) {
                    // الشاشة الثانية مو موجودة الحين -- يحاول مع الرجوع الجاي.
                }
            }
        }
    }

    override fun onHostPause() {}

    override fun onHostDestroy() {
        UiThreadUtil.runOnUiThread {
            presentation?.dismiss()
            presentation = null
        }
    }
}

/** باركود QR من نص، أسود على أبيض، مرسوم على الجهاز. */
private object Qr {
    fun bitmap(data: String, side: Int): Bitmap? = try {
        val m = QRCodeWriter().encode(data, BarcodeFormat.QR_CODE, side, side, mapOf(EncodeHintType.MARGIN to 1))
        val px = IntArray(side * side)
        for (y in 0 until side) for (x in 0 until side) px[y * side + x] = if (m.get(x, y)) Color.BLACK else Color.WHITE
        Bitmap.createBitmap(px, side, side, Bitmap.Config.ARGB_8888)
    } catch (_: Exception) {
        null
    }
}

/** صور الروابط (صورة الاسم) تنحمّل مرة وتبقى. */
private object ImageCache {
    private val map = HashMap<String, Bitmap>()
    private val main = Handler(Looper.getMainLooper())

    fun load(url: String, done: (Bitmap?) -> Unit) {
        map[url]?.let { done(it); return }
        thread {
            val bmp = try {
                val c = URL(url).openConnection() as HttpURLConnection
                c.connectTimeout = 8000
                c.readTimeout = 8000
                c.inputStream.use { BitmapFactory.decodeStream(it) }
            } catch (_: Exception) {
                null
            }
            main.post {
                if (bmp != null) map[url] = bmp
                done(bmp)
            }
        }
    }
}

class CustomerPresentation(
    context: Context,
    display: Display,
    private val mode: String,
    private val content: String,
) : Presentation(context, display) {

    private val cfg: JSONObject = try { JSONObject(content) } catch (_: Exception) { JSONObject() }
    private val bg = parse(cfg.optString("bg"), Color.parseColor("#5C1408"))
    private val ink = parse(cfg.optString("ink"), Color.parseColor("#FBEABE"))
    private val soft = parse(cfg.optString("soft"), Color.argb(184, 251, 234, 190))
    private val cream = Color.parseColor("#FFF6E3")
    private val dark = Color.parseColor("#2A0D06")

    private var unit = 1f // 1% من أصغر بعدين الشاشة، بالبكسل
    private lateinit var idle: LinearLayout
    private lateinit var totalBox: LinearLayout
    private lateinit var totalAmount: TextView
    private lateinit var codeBox: LinearLayout
    private lateinit var loyaltyCard: LinearLayout
    private lateinit var pagerCard: LinearLayout
    private lateinit var pagerNum: TextView
    private lateinit var pagerImg: ImageView
    private lateinit var pagerBar: View
    private lateinit var pagerTrack: View
    private var pagerAnim: ValueAnimator? = null
    private val hidePagerRun = Runnable { hidePager() }
    private lateinit var codeTitle: TextView
    private lateinit var codeImg: ImageView
    private lateinit var codeMsg: TextView
    private lateinit var codeBar: View
    private var built = false
    private var pendingTotal = ""
    private var barAnim: ValueAnimator? = null
    private val handler = Handler(Looper.getMainLooper())
    private val hideRun = Runnable { hideCode() }

    private fun parse(s: String, def: Int): Int = try { if (s.isBlank()) def else Color.parseColor(s) } catch (_: Exception) { def }

    private fun font(name: String, fallback: Typeface): Typeface =
        try { Typeface.createFromAsset(context.assets, "fonts/$name") } catch (_: Exception) { fallback }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val m = context.resources.displayMetrics
        unit = minOf(m.widthPixels, m.heightPixels) / 100f
        val root = FrameLayout(context)
        root.setBackgroundColor(if (mode == "image") Color.WHITE else bg)
        setContentView(root, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        if (mode == "image") buildImage(root) else buildBrand(root, m.widthPixels)
        built = true
        setTotal(pendingTotal)
    }

    private fun buildImage(root: FrameLayout) {
        val img = ImageView(context)
        val fill = cfg.optBoolean("fill", true)
        img.scaleType = if (fill) ImageView.ScaleType.CENTER_CROP else ImageView.ScaleType.FIT_CENTER
        val lp = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        if (!fill) lp.setMargins((unit * 10).toInt(), (unit * 10).toInt(), (unit * 10).toInt(), (unit * 10).toInt())
        root.addView(img, lp)
        ImageCache.load(cfg.optString("url")) { b -> if (b != null) img.setImageBitmap(b) }
    }

    private fun text(s: String, sizeUnits: Float, color: Int, tf: Typeface): TextView {
        val t = TextView(context)
        t.text = s
        t.setTextColor(color)
        t.typeface = tf
        t.gravity = Gravity.CENTER
        t.setTextSize(TypedValue.COMPLEX_UNIT_PX, unit * sizeUnits)
        t.includeFontPadding = false
        return t
    }

    private fun centered(): LinearLayout {
        val l = LinearLayout(context)
        l.orientation = LinearLayout.VERTICAL
        l.gravity = Gravity.CENTER
        return l
    }

    private val full get() = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    private fun wrap() = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)

    /** اسم المطعم: صورة الاسم لو فيه رابط، وإلا كتابة. */
    private fun nameView(widthPx: Int, sizeUnits: Float, bold: Typeface): View {
        val logo = cfg.optString("logo")
        val name = text(cfg.optString("name"), sizeUnits, ink, bold)
        if (!logo.startsWith("https://")) return name
        val box = FrameLayout(context)
        val img = ImageView(context)
        img.adjustViewBounds = true
        img.scaleType = ImageView.ScaleType.FIT_CENTER
        img.maxWidth = widthPx
        img.maxHeight = (unit * sizeUnits * 1.6f).toInt()
        img.visibility = View.GONE
        box.addView(name, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
        box.addView(img, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
        ImageCache.load(logo) { b ->
            if (b != null) {
                img.setImageBitmap(b)
                img.visibility = View.VISIBLE
                name.visibility = View.GONE
            }
        }
        return box
    }

    private fun buildBrand(root: FrameLayout, screenW: Int) {
        val bold = font("Tajawal-Bold.ttf", Typeface.DEFAULT_BOLD)
        val regular = font("Tajawal-Regular.ttf", Typeface.DEFAULT)
        val riyal = font("SaudiRiyal-Bold.ttf", Typeface.DEFAULT_BOLD)

        // الترحيب: الاسم في النص بالضبط. ولو فيه باركود منيو ثابت: الاسم
        // يمين والباركود يسار، والاثنين مع بعض في النص.
        val menuQr = cfg.optString("menuQr")
        val hello = centered()
        hello.addView(nameView((screenW * (if (menuQr.isEmpty()) 0.72f else 0.44f)).toInt(), if (menuQr.isEmpty()) 22f else 15f, bold), wrap())
        val line = View(context)
        line.background = GradientDrawable().apply { setColor(ink); cornerRadius = unit; alpha = 110 }
        hello.addView(line, LinearLayout.LayoutParams((unit * 14).toInt(), (unit * 0.8f).toInt()).apply { topMargin = (unit * 5).toInt() })
        hello.addView(text("حيّاك الله", 6.4f, soft, bold), wrap().apply { topMargin = (unit * 3.5f).toInt() })
        if (menuQr.isEmpty()) {
            idle = hello
        } else {
            idle = LinearLayout(context)
            idle.orientation = LinearLayout.HORIZONTAL
            idle.gravity = Gravity.CENTER
            idle.layoutDirection = View.LAYOUT_DIRECTION_RTL
            idle.addView(hello, wrap())
            val card = centered()
            card.background = GradientDrawable().apply { setColor(cream); cornerRadius = unit * 4 }
            card.setPadding((unit * 3.5f).toInt(), (unit * 3).toInt(), (unit * 3.5f).toInt(), (unit * 2.6f).toInt())
            card.addView(text("MENU", 6.4f, dark, bold), wrap())
            val side = (unit * 40).toInt()
            val q = ImageView(context)
            q.scaleType = ImageView.ScaleType.FIT_CENTER
            q.setBackgroundColor(Color.WHITE)
            val qp = (unit * 1.4f).toInt()
            q.setPadding(qp, qp, qp, qp)
            card.addView(q, LinearLayout.LayoutParams(side, side).apply { topMargin = (unit * 1.8f).toInt() })
            card.addView(text("امسح واطلب بجوالك", 4f, Color.argb(190, 42, 13, 6), regular), wrap().apply { topMargin = (unit * 1.6f).toInt() })
            q.setImageBitmap(Qr.bitmap(menuQr, side))
            idle.addView(card, wrap().apply { marginStart = (unit * 9).toInt() })
        }
        root.addView(idle, full)

        // المبلغ المطلوب.
        totalBox = centered()
        totalBox.addView(nameView((screenW * 0.38f).toInt(), 9f, bold), wrap())
        totalBox.addView(text("المبلغ المطلوب", 6.6f, soft, bold), wrap().apply { topMargin = (unit * 6).toInt() })
        val row = LinearLayout(context)
        row.orientation = LinearLayout.HORIZONTAL
        row.gravity = Gravity.CENTER
        row.layoutDirection = View.LAYOUT_DIRECTION_LTR
        totalAmount = text("", 24f, ink, bold)
        row.addView(totalAmount, wrap())
        row.addView(text("⃁", 13f, ink, riyal), wrap().apply { leftMargin = (unit * 2.4f).toInt() })
        totalBox.addView(row, wrap().apply { topMargin = (unit * 1.5f).toInt() })
        totalBox.visibility = View.GONE
        root.addView(totalBox, full)

        // الباركود: كرت كريمي في النص -- وبيجر الطلب بجانبه إن ظهرا معاً.
        codeBox = LinearLayout(context)
        codeBox.orientation = LinearLayout.HORIZONTAL
        codeBox.gravity = Gravity.CENTER
        codeBox.layoutDirection = View.LAYOUT_DIRECTION_RTL
        val card = centered()
        loyaltyCard = card
        card.background = GradientDrawable().apply { setColor(cream); cornerRadius = unit * 5 }
        card.setPadding((unit * 6).toInt(), (unit * 4).toInt(), (unit * 6).toInt(), (unit * 3.5f).toInt())
        codeTitle = text("", 8f, dark, bold)
        card.addView(codeTitle, wrap())
        val qrSide = (unit * 48).toInt()
        val qrFrame = FrameLayout(context)
        qrFrame.background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = unit * 3 }
        val pad = (unit * 2).toInt()
        qrFrame.setPadding(pad, pad, pad, pad)
        codeImg = ImageView(context)
        codeImg.scaleType = ImageView.ScaleType.FIT_CENTER
        qrFrame.addView(codeImg, FrameLayout.LayoutParams(qrSide, qrSide))
        card.addView(qrFrame, wrap().apply { topMargin = (unit * 2.5f).toInt() })
        codeMsg = text("", 4.6f, Color.argb(190, 42, 13, 6), regular)
        codeMsg.maxWidth = (unit * 80).toInt()
        card.addView(codeMsg, wrap().apply { topMargin = (unit * 2.2f).toInt() })
        val track = FrameLayout(context)
        track.background = GradientDrawable().apply { setColor(Color.argb(30, 42, 13, 6)); cornerRadius = unit }
        codeBar = View(context)
        codeBar.background = GradientDrawable().apply { setColor(bg); cornerRadius = unit }
        codeBar.pivotX = (unit * 52) // الشريط يقصر من اليسار لليمين
        track.addView(codeBar, FrameLayout.LayoutParams((unit * 52).toInt(), (unit * 1.2f).toInt()))
        card.addView(track, LinearLayout.LayoutParams((unit * 52).toInt(), (unit * 1.2f).toInt()).apply { topMargin = (unit * 2.6f).toInt() })
        buildPagerCard(bold, regular)
        // RTL: الأول يمين -- البيجر يمين لأنه أول ما يظهر بعد الدفع.
        codeBox.addView(pagerCard, wrap())
        codeBox.addView(card, wrap().apply { marginStart = (unit * 4).toInt() })
        card.visibility = View.GONE
        pagerCard.visibility = View.GONE
        codeBox.visibility = View.GONE
        root.addView(codeBox, full)
    }

    /** بطاقة البيجر: شريطٌ بلون المحل فيه رقم الطلب، ثم الباركود على أبيض. */
    private fun buildPagerCard(bold: Typeface, regular: Typeface) {
        pagerCard = LinearLayout(context)
        pagerCard.orientation = LinearLayout.VERTICAL
        pagerCard.gravity = Gravity.CENTER_HORIZONTAL
        pagerCard.background = GradientDrawable().apply { setColor(cream); cornerRadius = unit * 5 }
        pagerCard.clipToOutline = true
        val band = centered()
        band.background = GradientDrawable().apply {
            setColor(bg)
            cornerRadii = floatArrayOf(unit * 5, unit * 5, unit * 5, unit * 5, 0f, 0f, 0f, 0f)
        }
        band.setPadding((unit * 6).toInt(), (unit * 2.6f).toInt(), (unit * 6).toInt(), (unit * 2.2f).toInt())
        band.addView(text("رقم طلبك", 4.2f, soft, bold), wrap())
        pagerNum = text("", 13f, ink, bold)
        pagerNum.textDirection = View.TEXT_DIRECTION_LTR
        band.addView(pagerNum, wrap().apply { topMargin = (unit * 0.6f).toInt() })
        pagerCard.addView(band, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        val body = centered()
        body.setPadding((unit * 5).toInt(), (unit * 2.4f).toInt(), (unit * 5).toInt(), (unit * 3).toInt())
        val msg = text("امسح وخلّ جوالك يناديك\nأول ما يجهز طلبك", 4.4f, dark, bold)
        msg.setLineSpacing(0f, 1.15f)
        body.addView(msg, wrap())
        val side = (unit * 40).toInt()
        val frame = FrameLayout(context)
        frame.background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = unit * 3 }
        val pad = (unit * 1.8f).toInt()
        frame.setPadding(pad, pad, pad, pad)
        pagerImg = ImageView(context)
        pagerImg.scaleType = ImageView.ScaleType.FIT_CENTER
        frame.addView(pagerImg, FrameLayout.LayoutParams(side, side))
        body.addView(frame, wrap().apply { topMargin = (unit * 2).toInt() })
        body.addView(text("بدون تطبيق • ما يحتاج تسجيل", 3.4f, Color.argb(170, 42, 13, 6), regular), wrap().apply { topMargin = (unit * 1.8f).toInt() })
        val track = FrameLayout(context)
        track.background = GradientDrawable().apply { setColor(Color.argb(30, 42, 13, 6)); cornerRadius = unit }
        pagerBar = View(context)
        pagerBar.background = GradientDrawable().apply { setColor(bg); cornerRadius = unit }
        pagerBar.pivotX = unit * 40
        track.addView(pagerBar, FrameLayout.LayoutParams((unit * 40).toInt(), (unit * 1.1f).toInt()))
        body.addView(track, LinearLayout.LayoutParams((unit * 40).toInt(), (unit * 1.1f).toInt()).apply { topMargin = (unit * 2).toInt() })
        pagerTrack = track
        pagerCard.addView(body, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }

    /** اللوح ظاهر ما دامت فيه بطاقة، والمبلغ/الترحيب يرجع مع آخرها. */
    private fun syncCodeBox() {
        val any = loyaltyCard.visibility == View.VISIBLE || pagerCard.visibility == View.VISIBLE
        if (any) {
            idle.visibility = View.GONE
            totalBox.visibility = View.GONE
            codeBox.visibility = View.VISIBLE
        } else {
            codeBox.visibility = View.GONE
            setTotal(pendingTotal)
        }
    }

    fun showPager(qrUrl: String, number: String, secs: Long) {
        if (!built || mode != "brand") return
        pagerNum.text = if (number.isEmpty()) "" else "#" + number
        pagerNum.visibility = if (number.isEmpty()) View.GONE else View.VISIBLE
        pagerImg.setImageBitmap(Qr.bitmap(qrUrl, (unit * 40).toInt()))
        pagerCard.visibility = View.VISIBLE
        syncCodeBox()
        pagerAnim?.cancel()
        handler.removeCallbacks(hidePagerRun)
        val ms = if (secs > 0) secs * 1000 else 5 * 60 * 1000L
        pagerTrack.visibility = if (secs > 0) View.VISIBLE else View.GONE
        if (secs > 0) {
            pagerBar.scaleX = 1f
            pagerAnim = ValueAnimator.ofFloat(1f, 0f).apply {
                duration = ms
                interpolator = LinearInterpolator()
                addUpdateListener { pagerBar.scaleX = it.animatedValue as Float }
                start()
            }
        }
        handler.postDelayed(hidePagerRun, ms)
    }

    fun hidePager() {
        if (!built || mode != "brand") return
        handler.removeCallbacks(hidePagerRun)
        pagerAnim?.cancel()
        pagerCard.visibility = View.GONE
        syncCodeBox()
    }

    fun setTotal(s: String) {
        pendingTotal = s
        if (!built || mode != "brand") return
        totalAmount.text = s
        if (codeBox.visibility == View.VISIBLE) return
        totalBox.visibility = if (s.isNotEmpty()) View.VISIBLE else View.GONE
        idle.visibility = if (s.isNotEmpty()) View.GONE else View.VISIBLE
    }

    fun showCode(qrUrl: String, title: String, msg: String, secs: Long) {
        if (!built || mode != "brand") return
        codeTitle.text = title
        codeMsg.text = msg
        codeMsg.visibility = if (msg.isEmpty()) View.GONE else View.VISIBLE
        codeImg.setImageBitmap(Qr.bitmap(qrUrl, (unit * 48).toInt()))
        loyaltyCard.visibility = View.VISIBLE
        syncCodeBox()
        barAnim?.cancel()
        codeBar.scaleX = 1f
        barAnim = ValueAnimator.ofFloat(1f, 0f).apply {
            duration = secs * 1000
            interpolator = LinearInterpolator()
            addUpdateListener { codeBar.scaleX = it.animatedValue as Float }
            start()
        }
        handler.removeCallbacks(hideRun)
        handler.postDelayed(hideRun, secs * 1000)
    }

    fun hideCode() {
        if (!built || mode != "brand") return
        handler.removeCallbacks(hideRun)
        barAnim?.cancel()
        loyaltyCard.visibility = View.GONE
        syncCodeBox()
    }

    override fun onStop() {
        handler.removeCallbacks(hideRun)
        handler.removeCallbacks(hidePagerRun)
        barAnim?.cancel()
        pagerAnim?.cancel()
        super.onStop()
    }
}
