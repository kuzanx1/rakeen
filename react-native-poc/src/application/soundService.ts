import { playAlertNative, playTapNative } from '../platform/sound';

/**
 * The POS's sound behaviour, ported from public/pos/rakeen-pos.js.
 *
 * Two genuinely separate systems there, kept separate here:
 *
 *  - playTapSound() (rakeen-pos.js:415): a soft ~35 ms tick on every
 *    button press. Pure "your tap registered" feedback, NOT an alert --
 *    which is why it is deliberately NOT gated on notify_sound_enabled:
 *    that column controls notification sounds, and the source's own tap
 *    listener never consults it.
 *  - playAlertSound(kind) (rakeen-pos.js:376): the recorded chimes, each
 *    call site of which IS gated (`if(NOTIFY_SOUND_ENABLED) ...`) at
 *    lines 4945 / 5106 / 5113 / 6345 / 6404.
 *
 * The waveform/asset details live in the native module; this layer owns
 * the same gating and the same repeat cadence the source uses.
 */

export type AlertKind = 'new_order' | 'warning' | 'alarm' | 'order_ready' | 'incoming_order';

/**
 * businesses.notify_sound_enabled, mirroring the source's own default:
 * `NOTIFY_SOUND_ENABLED = loyaltyRes.data.notify_sound_enabled !== false`
 * (rakeen-pos.js:5889) -- i.e. ON unless explicitly false, and ON before
 * the business row has loaded (its initial value is `true` at :5650).
 */
let notifySoundEnabled = true;

export function setNotifySoundEnabled(enabled: boolean): void {
  notifySoundEnabled = enabled;
}

export function isNotifySoundEnabled(): boolean {
  return notifySoundEnabled;
}

/** playTapSound() -- ungated, fire-and-forget. */
export function playTapSound(): void {
  void playTapNative();
}

/** playAlertSound(kind), including the NOTIFY_SOUND_ENABLED gate that
 *  every one of its call sites applies. */
export function playAlertSound(kind: AlertKind): void {
  if (!notifySoundEnabled) return;
  void playAlertNative(kind);
}

/**
 * startIncomingOrderSound() (rakeen-pos.js:6404): unlike the other
 * alerts this one repeats every 4s until acted on, because it demands an
 * action rather than just informing. Same interval, same immediate first
 * play, same gate.
 */
const INCOMING_ORDER_REPEAT_MS = 4000;
let incomingOrderTimer: ReturnType<typeof setInterval> | null = null;

export function startIncomingOrderSound(): void {
  if (!notifySoundEnabled) return;
  if (incomingOrderTimer) return;
  playAlertSound('incoming_order');
  incomingOrderTimer = setInterval(() => playAlertSound('incoming_order'), INCOMING_ORDER_REPEAT_MS);
}

export function stopIncomingOrderSound(): void {
  if (!incomingOrderTimer) return;
  clearInterval(incomingOrderTimer);
  incomingOrderTimer = null;
}
