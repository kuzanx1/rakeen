import Foundation
import AVFoundation

/**
 * Real audio playback for the POS's two distinct sound systems, both
 * ported from public/pos/rakeen-pos.js rather than reinvented:
 *
 *  1. playTap() -- the UI "tick" that fires on every button press
 *     (playTapSound(), rakeen-pos.js:415). The web version synthesises it
 *     with WebAudio: a 1000 Hz sine whose gain ramps 0.0001 -> 0.05 over
 *     4 ms then decays exponentially back to 0.0001 by 32 ms, stopped at
 *     35 ms. Reproduced here by rendering those exact numbers into a PCM
 *     buffer once at init and replaying it, which is also what the
 *     source's own comment asks for -- it reuses one AudioContext rather
 *     than building one per tap because this fires constantly during
 *     cashiering and the target hardware is weak.
 *
 *  2. playAlert(kind) -- the three recorded alert sounds
 *     (ALERT_SOUND_FILES, rakeen-pos.js:368), bundled as real assets.
 *     Matches the source's `audio.currentTime = 0` restart semantics so a
 *     repeat retriggers from the start instead of being ignored while the
 *     previous one is still playing.
 *
 * Audio session is .playback with .mixWithOthers: alerts have to be
 * audible the way they are in the browser (a POS that silently drops a
 * new-order alert is worse than useless), but this must never interrupt
 * whatever else the device is playing. Never throws over a sound -- the
 * source's own rule, stated twice in its comments.
 */
@objc(RakeenSoundModule)
class RakeenSoundModule: NSObject {

  /// One player per alert kind, kept alive between plays -- the source
  /// caches its Audio objects the same way (alertAudioCache).
  private var alertPlayers: [String: AVAudioPlayer] = [:]
  private var tapPlayer: AVAudioPlayer?
  private var sessionConfigured = false
  private let lock = NSLock()

  /// ALERT_SOUND_FILES, verbatim. order_ready and incoming_order
  /// deliberately reuse the general chime -- the source has no dedicated
  /// asset for either and says so.
  ///
  /// Underscored rather than the web's `notify-general.mp3`: Android
  /// res/raw rejects hyphens in resource names, so both platforms share
  /// one spelling instead of diverging. Same three files, same bytes.
  private static let alertFiles: [String: String] = [
    "new_order": "notify_general",
    "warning": "notify_prep_warning",
    "alarm": "notify_prep_expired",
    "order_ready": "notify_general",
    "incoming_order": "notify_general",
  ]

  @objc static func requiresMainQueueSetup() -> Bool { return false }

  private func configureSessionIfNeeded() {
    guard !sessionConfigured else { return }
    sessionConfigured = true
    do {
      try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
      try AVAudioSession.sharedInstance().setActive(true)
    } catch {
      // A failed session config must not stop the app -- playback simply
      // may not be audible, same tolerance the web version has for a
      // blocked autoplay.
    }
  }

  /**
   * Renders playTapSound()'s waveform to 16-bit PCM WAV bytes.
   * frequency 1000 Hz sine; gain 0.0001 -> 0.05 linear over the first
   * 4 ms, then exponential decay to 0.0001 at 32 ms; total length 35 ms.
   */
  private func buildTapWav(sampleRate: Double = 44100) -> Data {
    let duration = 0.035
    let attackEnd = 0.004
    let decayEnd = 0.032
    let peak = 0.05
    let floorGain = 0.0001
    let frameCount = Int(duration * sampleRate)

    var samples = [Int16]()
    samples.reserveCapacity(frameCount)
    for i in 0..<frameCount {
      let t = Double(i) / sampleRate
      let gain: Double
      if t <= attackEnd {
        // linearRampToValueAtTime(0.05, now + 0.004)
        gain = floorGain + (peak - floorGain) * (t / attackEnd)
      } else if t <= decayEnd {
        // exponentialRampToValueAtTime(0.0001, now + 0.032)
        let progress = (t - attackEnd) / (decayEnd - attackEnd)
        gain = peak * pow(floorGain / peak, progress)
      } else {
        gain = floorGain
      }
      let value = sin(2.0 * Double.pi * 1000.0 * t) * gain
      samples.append(Int16(max(-1.0, min(1.0, value)) * 32767.0))
    }

    let dataBytes = samples.count * MemoryLayout<Int16>.size
    var wav = Data()
    func appendLE32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { wav.append(contentsOf: $0) } }
    func appendLE16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { wav.append(contentsOf: $0) } }

    wav.append(contentsOf: Array("RIFF".utf8))
    appendLE32(UInt32(36 + dataBytes))
    wav.append(contentsOf: Array("WAVE".utf8))
    wav.append(contentsOf: Array("fmt ".utf8))
    appendLE32(16)                              // PCM header size
    appendLE16(1)                               // format = PCM
    appendLE16(1)                               // channels = mono
    appendLE32(UInt32(sampleRate))
    appendLE32(UInt32(sampleRate) * 2)          // byte rate (mono, 16-bit)
    appendLE16(2)                               // block align
    appendLE16(16)                              // bits per sample
    wav.append(contentsOf: Array("data".utf8))
    appendLE32(UInt32(dataBytes))
    samples.withUnsafeBufferPointer { wav.append(UnsafeBufferPointer(start: $0.baseAddress, count: $0.count)) }
    return wav
  }

  @objc(playTap:rejecter:)
  func playTap(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    lock.lock()
    defer { lock.unlock() }
    configureSessionIfNeeded()
    do {
      if tapPlayer == nil {
        let player = try AVAudioPlayer(data: buildTapWav())
        player.prepareToPlay()
        tapPlayer = player
      }
      tapPlayer?.currentTime = 0
      tapPlayer?.play()
      resolve(true)
    } catch {
      // Tap feedback is a nice-to-have -- resolve false rather than
      // rejecting, so no call site ever has to guard it.
      resolve(false)
    }
  }

  @objc(playAlert:resolver:rejecter:)
  func playAlert(_ kind: NSString, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    lock.lock()
    defer { lock.unlock() }
    configureSessionIfNeeded()
    let key = kind as String
    guard let resource = RakeenSoundModule.alertFiles[key] else {
      resolve(false)
      return
    }
    do {
      var player = alertPlayers[key]
      if player == nil {
        guard let url = Bundle.main.url(forResource: resource, withExtension: "mp3") else {
          resolve(false)
          return
        }
        let created = try AVAudioPlayer(contentsOf: url)
        created.prepareToPlay()
        alertPlayers[key] = created
        player = created
      }
      // `audio.currentTime = 0` before play -- a retrigger restarts.
      player?.currentTime = 0
      player?.play()
      resolve(true)
    } catch {
      resolve(false)
    }
  }
}
