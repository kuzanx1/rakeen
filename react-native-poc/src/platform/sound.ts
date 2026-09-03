import { NativeModules } from 'react-native';

/**
 * Native audio bridge (RakeenSoundModule, iOS Swift + Android Kotlin).
 *
 * React Native has no WebAudio, so the PWA's two sound systems -- the
 * per-tap "tick" and the recorded alert chimes -- cannot be ported in JS
 * alone; both live behind this module, exactly the pattern the printer
 * and cash-drawer bridges already use.
 *
 * Every method resolves rather than rejects. The source states the rule
 * twice in its own comments ("never throw over a sound", "never throw
 * over a beep"), so a missing native module or a failed play is a false
 * return, never an exception a call site has to guard.
 */
export interface SoundBridge {
  playTap(): Promise<boolean>;
  playAlert(kind: string): Promise<boolean>;
}

const Native = NativeModules.RakeenSoundModule as SoundBridge | undefined;

/** True only when a real native implementation is linked into this build. */
export const isSoundBridgeAvailable = !!Native;

export async function playTapNative(): Promise<boolean> {
  if (!Native) return false;
  try {
    return await Native.playTap();
  } catch {
    return false;
  }
}

export async function playAlertNative(kind: string): Promise<boolean> {
  if (!Native) return false;
  try {
    return await Native.playAlert(kind);
  } catch {
    return false;
  }
}
