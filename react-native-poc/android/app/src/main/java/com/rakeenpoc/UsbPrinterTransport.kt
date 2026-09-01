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
    fun scan(callback: (List<Device>) -> Unit) {
        val printerDevices = manager().deviceList.values.filter { device ->
            (0 until device.interfaceCount).any { i -> device.getInterface(i).interfaceClass == UsbConstants.USB_CLASS_PRINTER }
        }
        callback(printerDevices.map { Device(it.deviceId.toString(), it.productName ?: it.deviceName) })
    }

    private fun findDevice(deviceId: String): UsbDevice? {
        val id = deviceId.toIntOrNull() ?: return null
        return manager().deviceList.values.firstOrNull { it.deviceId == id }
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
    private fun ensurePermission(device: UsbDevice, callback: (Boolean) -> Unit) {
        val usbManager = manager()
        if (usbManager.hasPermission(device)) {
            callback(true)
            return
        }
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                if (intent.action != ACTION_USB_PERMISSION) return
                context.unregisterReceiver(this)
                val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                callback(granted)
            }
        }
        val filter = IntentFilter(ACTION_USB_PERMISSION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            context.registerReceiver(receiver, filter)
        }
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
        val permissionIntent = PendingIntent.getBroadcast(context, 0, Intent(ACTION_USB_PERMISSION), flags)
        usbManager.requestPermission(device, permissionIntent)
    }

    fun send(deviceId: String, bytes: ByteArray, timeoutMs: Int, callback: (Boolean, String?) -> Unit) {
        val device = findDevice(deviceId)
        if (device == null) {
            callback(false, "device_not_found")
            return
        }
        ensurePermission(device) { granted ->
            if (!granted) {
                callback(false, "permission_denied")
                return@ensurePermission
            }
            Thread {
                val target = printerInterfaceAndEndpoint(device)
                if (target == null) {
                    callback(false, "no_bulk_out_endpoint")
                    return@Thread
                }
                val (intf, endpoint) = target
                val connection: UsbDeviceConnection? = manager().openDevice(device)
                if (connection == null) {
                    callback(false, "connection_failed")
                    return@Thread
                }
                try {
                    if (!connection.claimInterface(intf, true)) {
                        callback(false, "connection_failed")
                        return@Thread
                    }
                    val sent = connection.bulkTransfer(endpoint, bytes, bytes.size, timeoutMs)
                    if (sent >= 0) {
                        callback(true, null)
                    } else {
                        callback(false, "connection_failed")
                    }
                } finally {
                    try { connection.releaseInterface(intf) } catch (e: Exception) { /* best-effort cleanup */ }
                    connection.close()
                }
            }.start()
        }
    }

    fun testConnection(deviceId: String, callback: (Boolean, Double?, String?) -> Unit) {
        val device = findDevice(deviceId)
        if (device == null) {
            callback(false, null, "device_not_found")
            return
        }
        val start = System.nanoTime()
        ensurePermission(device) { granted ->
            if (!granted) {
                callback(false, null, "permission_denied")
                return@ensurePermission
            }
            val connection = manager().openDevice(device)
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
