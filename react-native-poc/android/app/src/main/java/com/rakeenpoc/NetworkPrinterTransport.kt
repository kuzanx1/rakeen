package com.rakeenpoc

import java.io.IOException
import java.net.ConnectException
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import java.net.UnknownHostException

/**
 * Android equivalent of ios/RakeenPOC/NetworkPrinterTransport.swift and,
 * further back, the Capacitor project's ios/App/App/NetworkPrinterTransport.swift
 * -- same contract, same error-string conventions, same "never assume
 * port 9100" rule, deliberately kept in sync so the JS-facing behavior is
 * identical on both platforms. Plain java.net.Socket, not a third-party
 * ESC/POS SDK -- for the same reason as the iOS side: the web/JS layer
 * already builds complete ESC/POS bytes; this only ever transports opaque
 * bytes.
 *
 * Network I/O must not run on Android's main thread (StrictMode throws
 * NetworkOnMainThreadException) -- both methods below run on a background
 * thread and call back with the result.
 *
 * UNVERIFIED beyond compilation -- never run against a real printer or a
 * real device. See docs/react-native-poc/phase5-android.md.
 */
class NetworkPrinterTransport(private val timeoutMs: Int = 6000) {

    fun send(host: String, port: Int, bytes: ByteArray, callback: (Boolean, String?) -> Unit) {
        Thread {
            try {
                Socket().use { socket ->
                    socket.connect(InetSocketAddress(host, port), timeoutMs)
                    val out = socket.getOutputStream()
                    out.write(bytes)
                    out.flush()
                    callback(true, null)
                }
            } catch (e: SocketTimeoutException) {
                callback(false, "connection_timeout")
            } catch (e: ConnectException) {
                callback(false, "connection_refused")
            } catch (e: UnknownHostException) {
                callback(false, "host_unreachable")
            } catch (e: IOException) {
                callback(false, "connection_error")
            }
        }.start()
    }

    /** Connectivity probe (open + immediately close) for testConnection --
     *  measures real latency to open the socket, same approach as the iOS
     *  side's testConnection. */
    fun testConnection(host: String, port: Int, callback: (Boolean, Double?, String?) -> Unit) {
        Thread {
            val start = System.nanoTime()
            try {
                Socket().use { socket ->
                    socket.connect(InetSocketAddress(host, port), timeoutMs)
                    val latencyMs = (System.nanoTime() - start) / 1_000_000.0
                    callback(true, latencyMs, null)
                }
            } catch (e: SocketTimeoutException) {
                callback(false, null, "connection_timeout")
            } catch (e: ConnectException) {
                callback(false, null, "connection_refused")
            } catch (e: UnknownHostException) {
                callback(false, null, "host_unreachable")
            } catch (e: IOException) {
                callback(false, null, "connection_error")
            }
        }.start()
    }
}
