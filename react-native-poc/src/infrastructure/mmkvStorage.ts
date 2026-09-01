import { MMKV } from 'react-native-mmkv';

/**
 * Checkpoint 8 (Offline Storage) -- real MMKV-backed flat key-value
 * store, replacing AsyncStorage for exactly the use cases
 * docs/react-native-poc/phase8-offline-storage.md's own evaluation calls
 * "kv_cache": the offline catalog snapshot, device config, cashier
 * profile cache, and printer target config (see application/authService.ts,
 * application/catalogService.ts, infrastructure/printerProfileStore.ts).
 * That
 * evaluation's actual reasoning (memory-mapped, fsync-backed durability;
 * "fastest... synchronous, JSI" vs. AsyncStorage's historically
 * SQLite-table-of-everything bottleneck on Android) is what's being acted
 * on here now that real usage exists to validate it against -- not a
 * blind application of the original recommendation.
 *
 * `react-native-mmkv@3.x` specifically (not the current 4.x) -- v4
 * rewrote itself on top of Nitro Modules (a second native-module codegen
 * system alongside this project's existing plain TurboModule/JSI-style
 * custom modules), which would add a whole new moving part for no
 * concrete benefit this checkpoint needs. v3 is still real, actively
 * maintained JSI/TurboModule code, consistent with how
 * RakeenPrinterModule/RakeenCashDrawerModule/RakeenDeviceModule are
 * already built.
 *
 * Deliberately exposes the SAME async get/set/remove shape
 * AsyncStorage's API has, even though MMKV's own native calls are
 * synchronous -- this makes swapping the underlying engine at each call
 * site a minimal, non-invasive change (the exact storage engine
 * underneath, not the calling code's sync/async shape) rather than a
 * wider rewrite of already-verified Checkpoint 2/3 call sites. If a
 * future checkpoint demonstrates a concrete need for genuinely
 * synchronous reads (e.g. a value needed before the first render), the
 * real synchronous API is still `storage.getString`/`storage.set`
 * directly -- nothing here prevents using it, this just isn't forcing
 * that change now without evidence it's needed.
 */
const storage = new MMKV({ id: 'rakeen-pos-kv-cache' });

export async function getItem(key: string): Promise<string | null> {
  const value = storage.getString(key);
  return value === undefined ? null : value;
}

export async function setItem(key: string, value: string): Promise<void> {
  storage.set(key, value);
}

export async function removeItem(key: string): Promise<void> {
  storage.delete(key);
}
