package com.rakeenpoc

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import java.io.IOException
import java.util.UUID

/**
 * Feature Parity Pass -- Bluetooth/USB printing. Real classic Bluetooth
 * (RFCOMM/SPP) transport for Android -- the path virtually every existing
 * cheap ESC/POS Bluetooth thermal printer actually uses (unlike iOS, which
 * has no classic-Bluetooth access for a non-MFi accessory at all -- see
 * ios/RakeenPOC/BluetoothPrinterTransport.swift's own doc comment for why
 * this project's two platforms genuinely differ here, not by oversight).
 *
 * SPP_UUID is the real, standard Bluetooth Serial Port Profile UUID
 * (Bluetooth SIG-assigned, used by essentially every classic-Bluetooth
 * serial device) -- not a vendor-specific guess, so this makes no
 * assumption about brand/model.
 *
 * UNVERIFIED beyond compilation: never run against a real paired printer.
 * Whether a specific real device accepts a plain RFCOMM connect + raw byte
 * write the way this assumes can only be confirmed on real hardware.
 */
class BluetoothClassicPrinterTransport(private val context: Context) {

    companion object {
        private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    }

    data class Device(val id: String, val name: String?)

    private fun hasConnectPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
        } else {
            true // BLUETOOTH/BLUETOOTH_ADMIN are normal (install-time) permissions pre-API31, never runtime-denied
        }
    }

    private fun hasScanPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
        } else {
            context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        }
    }

    private fun adapter(): BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()

    /** Bonded (already paired via Android's own Bluetooth settings) devices
     *  appear immediately; newly-discovered UNPAIRED devices are appended
     *  as Android's own discovery process (`startDiscovery`) finds them,
     *  until `timeoutMs` elapses. Real pairing (the OS-level PIN/passkey
     *  flow) for a brand-new device still has to happen via Android's
     *  Bluetooth settings first -- this app cannot and does not attempt to
     *  bond a device itself, matching the "let the OS own its own
     *  permission/pairing UI" principle already used for USB below. */
    fun scan(timeoutMs: Int, callback: (List<Device>, String?) -> Unit) {
        val bt = adapter()
        if (bt == null) {
            callback(emptyList(), "bluetooth_unavailable")
            return
        }
        if (!hasConnectPermission() || !hasScanPermission()) {
            callback(emptyList(), "permission_denied")
            return
        }
        if (!bt.isEnabled) {
            callback(emptyList(), "bluetooth_unavailable")
            return
        }

        val found = LinkedHashMap<String, Device>()
        try {
            @Suppress("MissingPermission") // checked above via hasConnectPermission()
            bt.bondedDevices?.forEach { d -> found[d.address] = Device(d.address, d.name) }
        } catch (e: SecurityException) {
            callback(emptyList(), "permission_denied")
            return
        }

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                if (intent.action != BluetoothDevice.ACTION_FOUND) return
                val device: BluetoothDevice? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                }
                device ?: return
                try {
                    @Suppress("MissingPermission")
                    found[device.address] = Device(device.address, device.name)
                } catch (e: SecurityException) {
                    // permission revoked mid-scan -- drop this one device, not the whole scan
                }
            }
        }
        context.registerReceiver(receiver, IntentFilter(BluetoothDevice.ACTION_FOUND))

        try {
            @Suppress("MissingPermission")
            bt.startDiscovery()
        } catch (e: SecurityException) {
            context.unregisterReceiver(receiver)
            callback(emptyList(), "permission_denied")
            return
        }

        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            try {
                @Suppress("MissingPermission")
                bt.cancelDiscovery()
            } catch (e: SecurityException) {
                // already lost permission -- nothing more to cancel safely
            }
            try {
                context.unregisterReceiver(receiver)
            } catch (e: IllegalArgumentException) {
                // already unregistered -- never crash a scan callback over this
            }
            callback(found.values.toList(), null)
        }, timeoutMs.toLong())
    }

    private fun openSocket(macAddress: String): BluetoothSocket? {
        val bt = adapter() ?: return null
        if (!hasConnectPermission()) return null
        val device = try {
            bt.getRemoteDevice(macAddress)
        } catch (e: IllegalArgumentException) {
            return null
        }
        return try {
            @Suppress("MissingPermission")
            device.createRfcommSocketToServiceRecord(SPP_UUID)
        } catch (e: IOException) {
            null
        }
    }

    fun send(macAddress: String, bytes: ByteArray, callback: (Boolean, String?) -> Unit) {
        Thread {
            if (!hasConnectPermission()) {
                callback(false, "permission_denied")
                return@Thread
            }
            val socket = openSocket(macAddress)
            if (socket == null) {
                callback(false, "device_not_found")
                return@Thread
            }
            try {
                @Suppress("MissingPermission")
                socket.connect()
                socket.outputStream.write(bytes)
                socket.outputStream.flush()
                callback(true, null)
            } catch (e: SecurityException) {
                callback(false, "permission_denied")
            } catch (e: IOException) {
                callback(false, "connection_failed")
            } finally {
                try { socket.close() } catch (e: IOException) { /* already closed/never opened */ }
            }
        }.start()
    }

    fun testConnection(macAddress: String, callback: (Boolean, Double?, String?) -> Unit) {
        Thread {
            if (!hasConnectPermission()) {
                callback(false, null, "permission_denied")
                return@Thread
            }
            val socket = openSocket(macAddress)
            if (socket == null) {
                callback(false, null, "device_not_found")
                return@Thread
            }
            val start = System.nanoTime()
            try {
                @Suppress("MissingPermission")
                socket.connect()
                val latencyMs = (System.nanoTime() - start) / 1_000_000.0
                callback(true, latencyMs, null)
            } catch (e: SecurityException) {
                callback(false, null, "permission_denied")
            } catch (e: IOException) {
                callback(false, null, "connection_failed")
            } finally {
                try { socket.close() } catch (e: IOException) { /* already closed/never opened */ }
            }
        }.start()
    }
}
