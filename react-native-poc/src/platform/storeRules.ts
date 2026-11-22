import { NativeModules, Platform } from 'react-native';

/**
 * App Store 3.1.1 and Google Play's payments policy: an app from the store
 * must not send the user to pay outside it. So iOS, and Android installed
 * from Google Play, show no subscribe/contact-to-pay prompts. The direct
 * APK (rakeenapp.com/android) keeps them.
 */
const PLAY_INSTALLER = 'com.android.vending';

function androidInstaller(): string | null {
  const m = NativeModules.RakeenDeviceModule;
  if (!m) return null;
  const direct = m.installer;
  if (typeof direct === 'string') return direct;
  const consts = typeof m.getConstants === 'function' ? m.getConstants() : null;
  return consts && typeof consts.installer === 'string' ? consts.installer : null;
}

export const NO_PAYMENT_STEERING: boolean =
  Platform.OS === 'ios' || (Platform.OS === 'android' && androidInstaller() === PLAY_INSTALLER);
