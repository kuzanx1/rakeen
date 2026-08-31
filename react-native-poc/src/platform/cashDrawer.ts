import { NativeModules } from 'react-native';
import type { PrinterTarget, PrinterErrorCode } from './printer';

/**
 * Deliberately does NOT assume every drawer uses the same kick command.
 * Most real-world setups wire the drawer through the receipt printer's own
 * RJ11 port and the standard ESC/POS kick sequence
 * (0x1B 0x70 0x00 0x19 0xFA — see ios/App/App/MainViewController.swift's
 * existing, hardcoded-but-documented default) works for the large
 * majority of hardware. This contract leaves room for a per-drawer
 * override WITHOUT requiring one to exist yet — `kickCommand` is optional;
 * omit it and native code uses its own standard default, exactly like the
 * Capacitor/Swift side already does.
 */
export interface CashDrawerCapabilities {
  supported: boolean;
}

export interface CashDrawerOpenOptions {
  target: PrinterTarget;
  /** Override the default kick bytes for a specific drawer/printer model
   *  that's been confirmed (on real hardware, not guessed) to need
   *  different bytes. Base64-encoded. Omit for the standard default. */
  kickCommandBase64?: string;
  timeoutMs: number;
}

export interface CashDrawerResult {
  ok: boolean;
  error?: PrinterErrorCode;
}

export interface CashDrawerAPI {
  open(options: CashDrawerOpenOptions): Promise<CashDrawerResult>;
  capabilities(): Promise<CashDrawerCapabilities>;
}

export const CashDrawer: CashDrawerAPI | undefined =
  NativeModules.RakeenCashDrawerModule;
