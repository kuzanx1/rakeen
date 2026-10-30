import { NativeModules } from 'react-native';

/**
 * الشاشة الثانية في سنمي (شاشة العميل) -- RakeenCustomerDisplayModule.kt.
 * على جهاز ما فيه الوحدة (آيفون، أو أندرويد بشاشة وحدة) كل شي يرجع بهدوء.
 *
 * - mirror: نفس شاشة الكاشير.
 * - brand: هوية المطعم (JSON: name, logo, bg, ink, soft)، وعليها المبلغ والباركود.
 * - image: صورة (JSON: url, fill).
 */
export type NativeDisplayMode = 'mirror' | 'brand' | 'image';

interface CustomerDisplayAPI {
  hasDisplay(): Promise<boolean>;
  show(mode: NativeDisplayMode, content: string): Promise<boolean>;
  total(text: string): void;
  /** data = نص الباركود (رابط)، يُرسم QR على الجهاز. */
  code(data: string, title: string, msg: string, secs: number): void;
  hideCode(): void;
}

const Native: CustomerDisplayAPI | undefined = NativeModules.RakeenCustomerDisplay;

export async function hasCustomerDisplay(): Promise<boolean> {
  try {
    return Native ? await Native.hasDisplay() : false;
  } catch {
    return false;
  }
}

export async function showOnCustomerDisplay(mode: NativeDisplayMode, content = ''): Promise<boolean> {
  try {
    return Native ? await Native.show(mode, content) : false;
  } catch {
    return false;
  }
}

/** المبلغ المطلوب على الهوية؛ نص فاضي يرجّع الترحيب. */
export function totalOnCustomerDisplay(text: string): void {
  try {
    Native?.total(text);
  } catch {
    // ما فيه شاشة.
  }
}

export function codeOnCustomerDisplay(qrUrl: string, title: string, msg: string, secs: number): void {
  try {
    Native?.code(qrUrl, title, msg, secs);
  } catch {
    // ما فيه شاشة.
  }
}

export function hideCodeOnCustomerDisplay(): void {
  try {
    Native?.hideCode();
  } catch {
    // ما فيه شاشة.
  }
}
