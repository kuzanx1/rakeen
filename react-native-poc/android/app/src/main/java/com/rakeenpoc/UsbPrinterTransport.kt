package com.rakeenpoc

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build

/**
 * Feature Parity Pass -- Bluetooth/USB printing. Real Android USB host-mode
 * transport -- genuinely implementable here (Android has a real, public
 * UsbManager host API); iOS has NO equivalent for a non-MFi-certified
 * accessory, so USB stays iOS-unsupported by real platform restriction,
 * not by omission (see platform/printer.ts's TRANSPORT_NOT_SUPPORTED doc
 * comment and RakeenPrinterModule.swift's own usb branch).
 *
 * Deliberately filters by USB_CLASS_PRINTER (0x07) -- the USB-IF standard
 * printer device class -- rather than any vendor/product ID allowlist, so
 * this makes no assumption about a specific manufacturer/model, per the
 * migration's explicit requirement.
 *
 * UNVERIFIED beyond compilation: never run against a real USB printer or
 * a real device's USB host port. Whether a given real printer's bulk-OUT
 * endpoint accepts raw ESC/POS bytes the way this assumes, and whether
 * requestPermission()'s consent dialog behaves as expected on every real
 * Android build, can only be confirmed on real hardware.
 */
class UsbPrinterTransport(private val context: Context) {

    companion object {
        private const val ACTION_USB_PERMISSION = "com.rakeenpoc.USB_PERMISSION"
        private const val LOG_TAG = "RakeenUsbPrinter"

        /**
         * كل كلام مع طابعة USB يمشي هنا، واحد ورا الثاني.
         *
         * الطباعة ودرج الكاش كل واحد له نسخة من هذا الكلاس، وكل وحدة كانت
         * تفتح الطابعة وتاخذ الواجهة بالقوة (claimInterface force=true) بخيط
         * لحالها. بعد الدفع تنطبع ورقة المطبخ أول، وبنفس اللحظة ينفتح الدرج:
         * الدرج يخطف الواجهة من نص ورقة المطبخ فتفشل، والفاتورة بعدها تطلع
         * عادي. عند «كباب طارق» وقت الزحمة: «أوراق المطبخ وقفت وما يطلع إلا
         * حقت الزباين». مشترك بين كل النسخ (companion)، فما يتزاحمون أبداً.
         */
        private val USB_IO = java.util.concurrent.Executors.newSingleThreadExecutor()

        /**
         * الفاتورةُ صورةٌ واحدة: رأسٌ يقول «جاءك ١٠٨ آلاف بايت» ثم البايتات.
         * وتُرسَل على دفعات، لأنّ bulkTransfer لا يحمل أكثر من ١٦ كيلو.
         *
         * وكان الانقطاعُ في دفعةٍ واحدة يكسر الحلقةَ ويُقفل الاتصال. والطابعةُ
         * لا تدري أنّ شيئاً انقطع: عدّادُها يقول «باقٍ لي ستّون ألفاً»، فتنتظر.
         * فتأتي ورقةُ الزبون التالي، فتبتلع منها ستّين ألفاً على أنّها بقيّةُ
         * الصورة، ثم تقرأ ما بعدها حروفاً -- فتخرج الورقةُ المشفَّرة بلا قصّ،
         * ملتصقةً بالتي قبلها لأنّ أمرَ القصّ كان في الجزء الذي لم يصل.
         *
         * فالعلاجُ طبقتان: لا نتخلّى عن دفعةٍ لأنّ الطابعة انشغلت لحظة
         * (writeAll يُعيد المحاولة)، وإن تخلّينا قيّدنا الباقيَ ديناً
         * وسدّدناه أصفاراً قبل الورقة التالية (settleDebt) -- فتُكمل الطابعةُ
         * صورتَها اليتيمة على ورقٍ أبيض، ثم تبدأ الورقةُ الجديدةُ نظيفة.
         */
        /**
         * ١٦ كيلو كما كانت قبل هذا الإصلاح، لا أقلّ.
         *
         * كنت نزّلتُها إلى ٤ كيلو بحجّة أنّ التعثّر يخسر أقلّ. وهي حجّةٌ
         * باطلة: الدَّينُ هو كلُّ ما لم يُرسَل بعدُ من الفاتورة، لا الدفعةَ
         * المتعثّرةَ وحدَها -- فحجمُ الدفعة لا يكاد يغيّر طولَ الشريط الأبيض.
         *
         * وما لا ينفع لا يُدفع ثمنُه: إبقاؤها كما كانت يجعل مسارَ النجاح
         * مطابقاً لما يعمل اليوم عند المطاعم -- نفسُ عدد النداءات، ونفسُ
         * أحجامها، ونفسُ البايتات. فلا يبقى في طريق الفاتورة السليمة
         * شيءٌ جديدٌ البتّة سوى بحثٍ واحدٍ في خريطةٍ فارغة.
         */
        private const val CHUNK = 16384
        private const val EMPTY_RETRIES = 3
        private const val EMPTY_RETRY_SLEEP_MS = 120L

        /**
         * بسرعةِ الورق لا بسرعةِ الكابل.
         *
         * قياسٌ من جهازِ مطعمٍ حقيقيّ («كباب طارق»، طابعة TA POS على USB):
         * إيصالٌ حجمُه ٧٦٫٤ ك.ب خرج من التطبيق في **٦٧٠ ملّي ثانية** --
         * أي ١١٤ ك.ب/ث. وذلك الإيصالُ طولُه على الورق ١٣ سنتيمتراً
         * تقريباً (٧٨٢٧٢ ÷ ٧٢ بايتاً للسطر = ١٠٨٦ سطراً ÷ ٨ أسطر/مم)،
         * ورأسٌ حراريٌّ يطبع ٥٠-٨٠ مم/ث يحتاج لها **ثانيتين**. فنحن
         * نُسلّمها ورقَ ثانيتين في ثلثي ثانية.
         *
         * والطابعةُ تبتلع ما لا تطبع في ذاكرةٍ صغيرة، فإن امتلأت أسقطت
         * بايتاتٍ بلا أن تقول شيئاً: وتقريرُ الإرسال عندنا يقول «نجح»
         * و«محاولات: 0» -- وهو صادق، البايتاتُ خرجت من الكابل. ثم تنزاح
         * الصورةُ من أوّل بايتٍ ضائع فتخرج الورقةُ ملطّخةً ثم رموزاً.
         * وهذا يفسّر ما لم يفسّره التقطيعُ ولا الدَّين: لا انقطاعَ هنا،
         * إنما فيضٌ.
         *
         * فيُهدَّأ الإرسالُ إلى ما يبتلعه الرأسُ فعلاً. والمهامُّ الصغيرة
         * (فتحُ الدرج، أمرُ تهيئة) لا تُمسّ.
         */
        private const val PACED_BYTES_PER_SECOND = 32 * 1024
        private const val PACE_ABOVE_BYTES = 16 * 1024

        /** ودفعاتٌ أصغرُ مع التهدئة: دفعةُ ١٦ ك.ب دفعةً واحدةً تملأ
         *  ذاكرةَ طابعةٍ صغيرةٍ قبل أن تبدأ التهدئةُ عملَها أصلاً. */
        private const val PACED_CHUNK = 4096

        /** أطولُ فاتورةٍ معقولةٍ بالشعار والباركود. ما فوقها رقمٌ غلط، ولا
         *  نُسدِّده ورقاً. */
        private const val MAX_DEBT = 160 * 1024

        /** بعدها نفترض أنّ الطابعة أُطفئت أو فُصلت، فما عادت تنتظر شيئاً:
         *  نُسقط الدين بلا ورق، ونكتفي بالتصفير. */
        private const val DEBT_TTL_MS = 120_000L

        /** ما لم يصل الطابعةَ من ورقةٍ سابقة، لكلِّ طابعةٍ على حدة. */
        private data class Debt(val bytes: Int, val at: Long)
        private val debtBytes = java.util.concurrent.ConcurrentHashMap<String, Debt>()

        /**
         * يكتب الحمولةَ كلَّها، ويُعيد ما وصل فعلاً.
         *
         * وما نُعيد المحاولةَ إلا على **الصفر**. فـbulkTransfer يُرجع عدد ما
         * أرسل، أو سالباً عند الخطأ أو انتهاء المهلة -- والسالبُ لا يقول كم
         * خرج قبل أن يقف. فإعادةُ دفعةٍ خرج نصفُها تُكرّر ذلك النصف على
         * الطابعة، وهو عينُ العطب الذي نُعالجه. أمّا الصفرُ فنجاحٌ بلا بيانات
         * (هكذا توثّقه أندرويد)، وإعادتُه آمنة.
         *
         * فما نقدر عليه بأمانٍ هو ألّا نخسر البايتات، لا أن نُنقذ الورقة:
         * إنقاذُها عند settleDebt.
         */
        private fun writeAll(
            connection: UsbDeviceConnection,
            endpoint: UsbEndpoint,
            bytes: ByteArray,
            timeoutMs: Int,
        ): Int {
            var offset = 0
            val paced = bytes.size > PACE_ABOVE_BYTES
            val startedAt = System.currentTimeMillis()
            while (offset < bytes.size) {
                if (paced && offset > 0) {
                    // كم كان يجب أن يمضي حتى هذا الحدّ لو مشينا بسرعة الورق.
                    val owedMs = offset.toLong() * 1000L / PACED_BYTES_PER_SECOND
                    val goneMs = System.currentTimeMillis() - startedAt
                    if (owedMs > goneMs) {
                        try { Thread.sleep(owedMs - goneMs) } catch (e: InterruptedException) { return offset }
                    }
                }
                val len = minOf(if (paced) PACED_CHUNK else CHUNK, bytes.size - offset)
                var sent = try { connection.bulkTransfer(endpoint, bytes, offset, len, timeoutMs) } catch (e: Exception) { -1 }
                var tries = 0
                while (sent == 0 && tries < EMPTY_RETRIES) {
                    tries++
                    try { Thread.sleep(EMPTY_RETRY_SLEEP_MS * tries) } catch (e: InterruptedException) { return offset }
                    sent = try { connection.bulkTransfer(endpoint, bytes, offset, len, timeoutMs) } catch (e: Exception) { -1 }
                }
                if (sent <= 0) return offset
                offset += sent
            }
            return offset
        }

        /**
         * يُسدِّد دَينَ الورقة المنقطعة: أصفاراً بعدد ما نقص، ثم تصفيرٌ وقصّ.
         *
         * والأصفارُ بيضاءُ في `GS v 0` (البتُّ المُشعَل هو الأسود)، فيخرج
         * شريطُ ورقٍ أبيضَ ثم قصّ -- وهذا أرخصُ بكثيرٍ من خربشةٍ بيد زبون.
         */
        private fun settleDebt(
            connection: UsbDeviceConnection,
            endpoint: UsbEndpoint,
            printerId: String,
            timeoutMs: Int,
        ): Boolean {
            val debt = debtBytes.remove(printerId) ?: return true
            val stale = System.currentTimeMillis() - debt.at > DEBT_TTL_MS
            android.util.Log.w(LOG_TAG, "settling debt of ${debt.bytes} bytes (stale=$stale)")
            // الأصفارُ آمنةٌ في الحالتين: إن كانت الطابعةُ تنتظر صورةً أكملتها
            // بيضاء، وإن لم تكن فـNUL يُهمَل في وضع النصّ. لكنّنا لا نُنفق
            // ورقاً على دَينٍ قديمٍ غالباً ما عاد له صاحب.
            if (!stale && debt.bytes in 1..MAX_DEBT) {
                val paid = writeAll(connection, endpoint, ByteArray(debt.bytes), timeoutMs)
                if (paid < debt.bytes) {
                    // ما زالت متعثّرة. نُعيد قيدَ ما بقي ولا نكتب فوقه فاتورةً
                    // جديدة: الكتابةُ على طابعةٍ ما زالت تنتظر هي العطبُ نفسُه.
                    debtBytes[printerId] = Debt(debt.bytes - paid, debt.at)
                    return false
                }
            }
            // ESC @ تصفير، ثم ذيلُ القصّ **نفسُه** الذي يُنهي به التطبيقُ كلَّ
            // فاتورة (domain/escposRaster.ts): ثلاثُ تغذياتٍ ثم GS V 0.
            //
            // وكنت كتبتُ هنا GS V 66 (قصٌّ جزئيٌّ بتغذية) من حفظي. وهو أمرٌ
            // لا تعرفه كلُّ طابعة، والتي لا تعرفه تطبع بايتاتِه حروفاً --
            // أي عينُ العطب الذي نُعالجه، نصنعه بأيدينا في طريق الإنقاذ.
            // فالقاعدةُ ألّا نُدخل على هذه الطابعة أمراً لم يُجرَّب عليها.
            val reset = byteArrayOf(0x1b, 0x40, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00)
            writeAll(connection, endpoint, reset, timeoutMs)
            return true
        }
    }

    data class Device(val id: String, val name: String?)

    private fun manager(): UsbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager

    /** Only USB Printer Class (0x07) devices -- a standards-based filter,
     *  not a vendor list. Present regardless of whether permission has
     *  been granted yet (enumeration itself needs no runtime permission on
     *  Android -- only actually OPENING a device does). */
    private fun printerDevices(): List<UsbDevice> = manager().deviceList.values.filter { device ->
        (0 until device.interfaceCount).any { i -> device.getInterface(i).interfaceClass == UsbConstants.USB_CLASS_PRINTER }
    }

    // المعرّف المحفوظ = «الشركة:الموديل» (vendorId:productId)، ثابت للطابعة.
    // كان deviceId، وأندرويد يعطيه رقم جديد كل ما الطابعة تنفصل وترجع (كثير
    // منها تعيد USB بعد القص أو النوم)، فتطلع «ما لقينا الطابعة» ويحتاج
    // الكاشير يختارها من جديد بعد كل فاتورة تقريباً.
    private fun stableId(device: UsbDevice): String = "${device.vendorId}:${device.productId}"

    fun scan(callback: (List<Device>) -> Unit) {
        callback(printerDevices().map { Device(stableId(it), it.productName ?: it.deviceName) })
    }

    // يقبل المعرّف الجديد، والقديم (رقم deviceId) للأجهزة المحفوظة قبل 1.30.
    // لو ما تطابق وفيه طابعة USB وحدة بس، هي المقصودة.
    private fun findDevice(savedId: String): UsbDevice? {
        val printers = printerDevices()
        val match = if (savedId.contains(":")) {
            printers.firstOrNull { stableId(it) == savedId }
        } else {
            val legacy = savedId.toIntOrNull()
            printers.firstOrNull { it.deviceId == legacy }
        }
        return match ?: printers.singleOrNull()
    }

    private fun printerInterfaceAndEndpoint(device: UsbDevice): Pair<UsbInterface, UsbEndpoint>? {
        for (i in 0 until device.interfaceCount) {
            val intf = device.getInterface(i)
            if (intf.interfaceClass != UsbConstants.USB_CLASS_PRINTER) continue
            for (e in 0 until intf.endpointCount) {
                val endpoint = intf.getEndpoint(e)
                if (endpoint.direction == UsbConstants.USB_DIR_OUT && endpoint.type == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                    return intf to endpoint
                }
            }
        }
        return null
    }

    /** Requests the real Android system permission dialog when not
     *  already granted -- genuinely asynchronous (the user must tap
     *  Allow), never assumed/bypassed. `PendingIntent.FLAG_MUTABLE` is
     *  required here specifically: Android 12+ rejects an immutable
     *  PendingIntent used with UsbManager.requestPermission() in some
     *  OEM builds, a real, documented platform nuance for this exact API,
     *  not a generic choice. */
    // يرجّع null لو الإذن موجود، أو سبب الفشل: permission_denied (العميل
    // رفض) أو permission_request_failed (ما قدرنا نطلب الإذن أصلاً).
    //
    // الـIntent لازم يكون صريح (setPackage): من Android 14 مع targetSdk 34+
    // النظام يرمي IllegalArgumentException لـPendingIntent قابل للتعديل
    // (FLAG_MUTABLE) بـIntent ضمني. كان يطلع للعميل «خطأ غير متوقع» في
    // «اختبار الاتصال»، والطباعة نفسها ما تشتغل، على أي جهاز Android 14+.
    private fun ensurePermission(device: UsbDevice, callback: (String?) -> Unit) {
        val usbManager = manager()
        if (usbManager.hasPermission(device)) {
            callback(null)
            return
        }
        var done = false
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                if (intent.action != ACTION_USB_PERMISSION || done) return
                done = true
                try { context.unregisterReceiver(this) } catch (e: Exception) { /* already gone */ }
                val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                callback(if (granted) null else "permission_denied")
            }
        }
        try {
            val filter = IntentFilter(ACTION_USB_PERMISSION)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                context.registerReceiver(receiver, filter)
            }
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
            val intent = Intent(ACTION_USB_PERMISSION).setPackage(context.packageName)
            val permissionIntent = PendingIntent.getBroadcast(context, 0, intent, flags)
            usbManager.requestPermission(device, permissionIntent)
        } catch (e: Exception) {
            if (!done) {
                done = true
                try { context.unregisterReceiver(receiver) } catch (x: Exception) { /* never registered */ }
                callback("permission_request_failed")
            }
        }
    }

    // بعد القص بعض الطابعات تختفي من USB ثانية أو ثانيتين وترجع. لو جت
    // الفاتورة التالية في هالوقت، ننتظرها بدل ما نقول «ما لقينا الطابعة».
    private fun awaitDevice(savedId: String, callback: (UsbDevice?) -> Unit) {
        findDevice(savedId)?.let { callback(it); return }
        Thread {
            var found: UsbDevice? = null
            val until = System.currentTimeMillis() + 4000
            while (found == null && System.currentTimeMillis() < until) {
                try { Thread.sleep(250) } catch (e: InterruptedException) { break }
                found = findDevice(savedId)
            }
            callback(found)
        }.start()
    }

    fun send(deviceId: String, bytes: ByteArray, timeoutMs: Int, callback: (Boolean, String?) -> Unit) {
        awaitDevice(deviceId) { device -> if (device == null) callback(false, "device_not_found") else sendTo(device, bytes, timeoutMs, callback) }
    }

    private fun sendTo(device: UsbDevice, bytes: ByteArray, timeoutMs: Int, callback: (Boolean, String?) -> Unit) {
        ensurePermission(device) { permissionError ->
            if (permissionError != null) {
                callback(false, permissionError)
                return@ensurePermission
            }
            USB_IO.execute {
                val target = printerInterfaceAndEndpoint(device)
                if (target == null) {
                    callback(false, "no_bulk_out_endpoint")
                    return@execute
                }
                val (intf, endpoint) = target
                val connection: UsbDeviceConnection? = try { manager().openDevice(device) } catch (e: Exception) { null }
                if (connection == null) {
                    callback(false, "connection_failed")
                    return@execute
                }
                try {
                    if (!connection.claimInterface(intf, true)) {
                        callback(false, "connection_failed")
                        return@execute
                    }
                    // دَينُ ورقةٍ سابقةٍ انقطعت: يُسدَّد قبل أيِّ شيءٍ جديد.
                    if (!settleDebt(connection, endpoint, stableId(device), timeoutMs)) {
                        callback(false, "connection_failed")
                        return@execute
                    }

                    val sentAll = writeAll(connection, endpoint, bytes, timeoutMs)
                    if (sentAll < bytes.size) {
                        // ما وصل كلُّه. الطابعةُ الآن واقفةٌ في منتصف أمر صورة،
                        // تنتظر ما لم يصلها -- فنُقيّد الباقي ديناً ونسدّده أول
                        // اتصالٍ قادم، قبل أن تبتلع به ورقةَ زبونٍ آخر.
                        val owed = bytes.size - sentAll
                        debtBytes[stableId(device)] = Debt(owed, System.currentTimeMillis())
                        // العطلُ نادرٌ ولا يُستدعى بالطلب، فلو وقع عند مطعمٍ
                        // بعيدٍ أردنا أثراً يُقرأ بـadb logcat بدل التخمين.
                        android.util.Log.w(LOG_TAG, "truncated job: sent $sentAll of ${bytes.size}, owed $owed")
                        callback(false, "connection_failed")
                    } else {
                        debtBytes.remove(stableId(device))
                        callback(true, null)
                    }
                } catch (e: Exception) {
                    callback(false, "connection_failed")
                } finally {
                    try { connection.releaseInterface(intf) } catch (e: Exception) { /* best-effort cleanup */ }
                    connection.close()
                }
            }
        }
    }

    fun testConnection(deviceId: String, callback: (Boolean, Double?, String?) -> Unit) {
        val start = System.nanoTime()
        awaitDevice(deviceId) { device -> if (device == null) callback(false, null, "device_not_found") else testDevice(device, start, callback) }
    }

    private fun testDevice(device: UsbDevice, start: Long, callback: (Boolean, Double?, String?) -> Unit) {
        ensurePermission(device) { permissionError ->
            if (permissionError != null) {
                callback(false, null, permissionError)
                return@ensurePermission
            }
            USB_IO.execute {
                val connection = try { manager().openDevice(device) } catch (e: Exception) { null }
                if (connection == null) {
                    callback(false, null, "connection_failed")
                } else {
                    val latencyMs = (System.nanoTime() - start) / 1_000_000.0
                    connection.close()
                    callback(true, latencyMs, null)
                }
            }
        }
    }
}
