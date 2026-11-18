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
            Thread {
                val target = printerInterfaceAndEndpoint(device)
                if (target == null) {
                    callback(false, "no_bulk_out_endpoint")
                    return@Thread
                }
                val (intf, endpoint) = target
                val connection: UsbDeviceConnection? = try { manager().openDevice(device) } catch (e: Exception) { null }
                if (connection == null) {
                    callback(false, "connection_failed")
                    return@Thread
                }
                try {
                    if (!connection.claimInterface(intf, true)) {
                        callback(false, "connection_failed")
                        return@Thread
                    }
                    // bulkTransfer يرسل 16KB كحد أقصى بالمرة على أجهزة كثيرة،
                    // والفاتورة بالشعار أكبر من كذا: نرسلها على دفعات.
                    var offset = 0
                    var ok = true
                    while (offset < bytes.size) {
                        val len = minOf(16384, bytes.size - offset)
                        val sent = connection.bulkTransfer(endpoint, bytes, offset, len, timeoutMs)
                        if (sent <= 0) { ok = false; break }
                        offset += sent
                    }
                    callback(ok, if (ok) null else "connection_failed")
                } catch (e: Exception) {
                    callback(false, "connection_failed")
                } finally {
                    try { connection.releaseInterface(intf) } catch (e: Exception) { /* best-effort cleanup */ }
                    connection.close()
                }
            }.start()
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
