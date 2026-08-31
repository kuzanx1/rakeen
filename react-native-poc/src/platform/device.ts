import { NativeModules, Platform } from 'react-native';

/**
 * Minimal on purpose — this POC only needs enough of a third native
 * module to prove the full JS -> NativeModules -> Swift/Kotlin path works
 * for something that isn't printer/drawer, per Phase 7's "show Native
 * Bridge status" requirement. Not meant to grow into a real device-info
 * API without a real need.
 */
export interface DeviceInfo {
  platform: 'ios' | 'android';
  nativeModuleName: string;
  /** True only if RakeenDeviceModule actually responded — proves the
   *  round trip really happened, not just that NativeModules has an entry
   *  for it (which can exist even if native registration is broken). */
  bridgeReachable: boolean;
}

export interface DeviceAPI {
  getInfo(): Promise<{ platform: string; osVersion: string }>;
}

const NativeDevice: DeviceAPI | undefined = NativeModules.RakeenDeviceModule;

export async function getDeviceInfo(): Promise<DeviceInfo> {
  if (!NativeDevice) {
    return {
      platform: Platform.OS as 'ios' | 'android',
      nativeModuleName: 'RakeenDeviceModule',
      bridgeReachable: false,
    };
  }
  try {
    await NativeDevice.getInfo();
    return {
      platform: Platform.OS as 'ios' | 'android',
      nativeModuleName: 'RakeenDeviceModule',
      bridgeReachable: true,
    };
  } catch {
    return {
      platform: Platform.OS as 'ios' | 'android',
      nativeModuleName: 'RakeenDeviceModule',
      bridgeReachable: false,
    };
  }
}
