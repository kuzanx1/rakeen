package com.rakeenpoc

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.MediaPlayer
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlin.math.PI
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/**
 * Android half of the POS's two sound systems, ported from
 * public/pos/rakeen-pos.js -- see RakeenSoundModule.swift for the full
 * rationale; the numbers below are the same ones read off that file:
 *
 *  - playTap(): playTapSound()'s 1000 Hz sine, gain ramping
 *    0.0001 -> 0.05 over 4 ms then decaying exponentially to 0.0001 by
 *    32 ms, stopped at 35 ms. Rendered to PCM once and replayed through a
 *    static AudioTrack rather than rebuilt per tap -- the source's own
 *    comment is explicit that this fires on every product-card tap and
 *    the target hardware is weak.
 *  - playAlert(kind): the three recorded assets from ALERT_SOUND_FILES,
 *    with order_ready/incoming_order reusing the general chime exactly as
 *    the source does. seekTo(0) before start() reproduces its
 *    `audio.currentTime = 0` restart semantics.
 *
 * Neither entry point ever rejects: the source treats audio as strictly
 * nice-to-have ("never throw over a beep") and resolves false instead so
 * no call site has to guard it.
 */
class RakeenSoundModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "RakeenSoundModule"

    companion object {
        private const val SAMPLE_RATE = 44100

        /** ALERT_SOUND_FILES, verbatim -- values are res/raw resource names. */
        private val ALERT_FILES = mapOf(
            "new_order" to "notify_general",
            "warning" to "notify_prep_warning",
            "alarm" to "notify_prep_expired",
            "order_ready" to "notify_general",
            "incoming_order" to "notify_general",
        )
    }

    private val alertPlayers = mutableMapOf<String, MediaPlayer>()
    private var tapTrack: AudioTrack? = null
    private var tapSamples: ShortArray? = null
    private val lock = Any()

    /** playTapSound()'s exact envelope, rendered to 16-bit mono PCM. */
    private fun buildTapSamples(): ShortArray {
        val duration = 0.035
        val attackEnd = 0.004
        val decayEnd = 0.032
        val peak = 0.05
        val floorGain = 0.0001
        val frameCount = (duration * SAMPLE_RATE).toInt()
        val out = ShortArray(frameCount)
        for (i in 0 until frameCount) {
            val t = i.toDouble() / SAMPLE_RATE
            val gain = when {
                // linearRampToValueAtTime(0.05, now + 0.004)
                t <= attackEnd -> floorGain + (peak - floorGain) * (t / attackEnd)
                // exponentialRampToValueAtTime(0.0001, now + 0.032)
                t <= decayEnd -> peak * (floorGain / peak).pow((t - attackEnd) / (decayEnd - attackEnd))
                else -> floorGain
            }
            val value = sin(2.0 * PI * 1000.0 * t) * gain
            out[i] = (max(-1.0, min(1.0, value)) * 32767.0).toInt().toShort()
        }
        return out
    }

    @ReactMethod
    fun playTap(promise: Promise) {
        try {
            synchronized(lock) {
                val samples = tapSamples ?: buildTapSamples().also { tapSamples = it }
                val byteCount = samples.size * 2
                var track = tapTrack
                if (track == null) {
                    track = AudioTrack.Builder()
                        .setAudioAttributes(
                            AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build()
                        )
                        .setAudioFormat(
                            AudioFormat.Builder()
                                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                                .setSampleRate(SAMPLE_RATE)
                                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                                .build()
                        )
                        .setBufferSizeInBytes(byteCount)
                        // STATIC: the buffer is written once and re-primed
                        // per tap, instead of streaming it every time.
                        .setTransferMode(AudioTrack.MODE_STATIC)
                        .build()
                    track.write(samples, 0, samples.size)
                    tapTrack = track
                }
                track.stop()
                track.reloadStaticData()
                track.play()
            }
            promise.resolve(true)
        } catch (e: Exception) {
            // Tap feedback is a nice-to-have -- never throw over it.
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun playAlert(kind: String, promise: Promise) {
        try {
            val resourceName = ALERT_FILES[kind]
            if (resourceName == null) {
                promise.resolve(false)
                return
            }
            synchronized(lock) {
                var player = alertPlayers[kind]
                if (player == null) {
                    val resId = reactApplicationContext.resources.getIdentifier(
                        resourceName, "raw", reactApplicationContext.packageName
                    )
                    if (resId == 0) {
                        promise.resolve(false)
                        return
                    }
                    player = MediaPlayer.create(reactApplicationContext, resId)
                    if (player == null) {
                        promise.resolve(false)
                        return
                    }
                    player.setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    )
                    alertPlayers[kind] = player
                }
                // `audio.currentTime = 0` before play -- a retrigger restarts.
                player.seekTo(0)
                player.start()
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    override fun invalidate() {
        synchronized(lock) {
            alertPlayers.values.forEach { runCatching { it.release() } }
            alertPlayers.clear()
            runCatching { tapTrack?.release() }
            tapTrack = null
        }
        super.invalidate()
    }
}
