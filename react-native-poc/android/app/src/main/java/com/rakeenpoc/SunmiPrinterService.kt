package com.rakeenpoc

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Parcel

/**
 * SUNMI's own printer service on the terminal (woyou.aidlservice.jiuiv5),
 * the route SUNMI's apps use. Its Bluetooth "InnerPrinter" prints fine but
 * on the D2 mini the drawer stayed shut there, so the drawer command goes
 * through this service first.
 *
 * No AIDL stubs are bundled: sendRAWData is the 11th method of
 * IWoyouService (updateFirmware, getFirmwareStatus, getServiceVersion,
 * printerInit, printerSelfChecking, getPrinterSerialNo, getPrinterVersion,
 * getPrinterModal, getPrintedLength, lineWrap, sendRAWData), called with a
 * raw transact and a null callback.
 */
object SunmiPrinterService {
    private const val PACKAGE = "woyou.aidlservice.jiuiv5"
    private const val DESCRIPTOR = "woyou.aidlservice.jiuiv5.IWoyouService"
    private const val GET_SERVICE_VERSION = IBinder.FIRST_CALL_TRANSACTION + 2
    private const val GET_PRINTER_MODAL = IBinder.FIRST_CALL_TRANSACTION + 7
    private const val SEND_RAW_DATA = IBinder.FIRST_CALL_TRANSACTION + 10

    /** A no-argument String getter: the service version and model, read
     *  back to the cashier so a wrong method index shows as nonsense
     *  instead of a silent "ok". */
    private fun readString(service: IBinder, code: Int): String = try {
        val data = Parcel.obtain()
        val reply = Parcel.obtain()
        try {
            data.writeInterfaceToken(DESCRIPTOR)
            service.transact(code, data, reply, 0)
            reply.readException()
            reply.readString() ?: "-"
        } finally {
            data.recycle()
            reply.recycle()
        }
    } catch (e: Exception) {
        "err:" + (e.message ?: e.javaClass.simpleName)
    }

    /** Calls back once, on a background thread: ok, and either the
     *  service's version/model or the reason it failed ("unavailable"
     *  when the terminal has no such service). */
    fun sendRaw(context: Context, bytes: ByteArray, timeoutMs: Long, callback: (Boolean, String?) -> Unit) {
        val app = context.applicationContext
        val handler = Handler(Looper.getMainLooper())
        var done = false
        lateinit var connection: ServiceConnection
        fun finish(ok: Boolean, error: String?) {
            synchronized(this) {
                if (done) return
                done = true
            }
            try { app.unbindService(connection) } catch (e: Exception) { }
            Thread { callback(ok, error) }.start()
        }
        connection = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
                if (service == null) { finish(false, "unavailable"); return }
                Thread {
                    val data = Parcel.obtain()
                    val reply = Parcel.obtain()
                    val info = "v" + readString(service, GET_SERVICE_VERSION) + " " + readString(service, GET_PRINTER_MODAL)
                    try {
                        data.writeInterfaceToken(DESCRIPTOR)
                        data.writeByteArray(bytes)
                        data.writeStrongBinder(null)
                        service.transact(SEND_RAW_DATA, data, reply, 0)
                        reply.readException()
                        finish(true, info)
                    } catch (e: Exception) {
                        finish(false, info + " " + (e.message ?: "send_failed"))
                    } finally {
                        data.recycle()
                        reply.recycle()
                    }
                }.start()
            }
            override fun onServiceDisconnected(name: ComponentName?) {
                finish(false, "disconnected")
            }
        }
        val intent = Intent(DESCRIPTOR).setPackage(PACKAGE)
        val bound = try {
            app.bindService(intent, connection, Context.BIND_AUTO_CREATE)
        } catch (e: Exception) {
            false
        }
        if (!bound) {
            finish(false, "unavailable")
            return
        }
        handler.postDelayed({ finish(false, "timeout") }, timeoutMs)
    }
}
