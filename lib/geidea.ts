import { createHmac, timingSafeEqual } from "node:crypto";

// Encryption at rest for the one long-lived, recoverable per-business secret
// this codebase stores (a restaurant's own Geidea apiPassword — see
// business_payment_gateways). Uses native Web Crypto (crypto.subtle) rather
// than node:crypto's cipher functions, which are unexercised anywhere else
// in this Workers deployment. HMAC (node:crypto) and getRandomValues (Web
// Crypto) are each separately proven working here already — see
// app/api/webhooks/whatsapp/route.ts and
// app/api/dashboard/whatsapp-link/request-otp/route.ts — but no cipher call
// has ever run in this codebase, so the zero-polyfill-risk Web Crypto
// primitive is the safer default for a first-of-its-kind secret. The master
// key lives only in the Worker's env (GEIDEA_MASTER_KEY, a Cloudflare
// secret) — never in Postgres — so a compromised service-role key alone
// can't recover any restaurant's apiPassword.

async function importMasterKey(): Promise<CryptoKey> {
  const raw = process.env.GEIDEA_MASTER_KEY;
  if (!raw) throw new Error("GEIDEA_MASTER_KEY not configured");
  const keyBytes = Buffer.from(raw, "base64");
  if (keyBytes.length !== 32) throw new Error("GEIDEA_MASTER_KEY must decode to exactly 32 bytes");
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  const key = await importMasterKey();
  const ivBytes = crypto.getRandomValues(new Uint8Array(12)); // fresh IV every call, never reused
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv: ivBytes }, key, new TextEncoder().encode(plaintext));
  return {
    ciphertext: Buffer.from(cipherBuf).toString("base64"),
    iv: Buffer.from(ivBytes).toString("base64"),
  };
}

export async function decryptSecret(ciphertext: string, iv: string): Promise<string> {
  const key = await importMasterKey();
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(iv, "base64") },
    key,
    Buffer.from(ciphertext, "base64")
  );
  return new TextDecoder().decode(plainBuf);
}

// ===== Geidea HPP v2 (KSA) — https://docs.geidea.net/docs/geidea-checkout-v2 =====
// Create Session is authenticated with HTTP Basic (merchantPublicKey as
// username, apiPassword as password) and additionally request-signed:
// base64(HMAC-SHA256(key=apiPassword,
// data=merchantPublicKey+amount+currency+merchantReferenceId+timestamp)).
// amount must be formatted to exactly 2 decimals before hashing (Geidea's
// own sample code does this).
const GEIDEA_SESSION_URL = "https://api.ksamerchant.geidea.net/payment-intent/api/v2/direct/session";
const GEIDEA_CHECKOUT_BASE = "https://www.ksamerchant.geidea.net/hpp/checkout/";

function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

function buildSessionSignature(
  merchantPublicKey: string,
  apiPassword: string,
  amount: number,
  currency: string,
  merchantReferenceId: string,
  timestamp: string
): string {
  const data = `${merchantPublicKey}${formatAmount(amount)}${currency}${merchantReferenceId}${timestamp}`;
  return createHmac("sha256", apiPassword).update(data, "utf8").digest("base64");
}

export interface GeideaSessionResult {
  ok: boolean;
  sessionId?: string;
  redirectUrl?: string;
  error?: string;
}

export async function createGeideaSession(params: {
  merchantPublicKey: string;
  apiPassword: string;
  amount: number;
  currency: string;
  merchantReferenceId: string;
  callbackUrl: string;
  returnUrl: string;
  language?: "ar" | "en";
}): Promise<GeideaSessionResult> {
  const timestamp = new Date().toISOString();
  const signature = buildSessionSignature(
    params.merchantPublicKey, params.apiPassword, params.amount, params.currency, params.merchantReferenceId, timestamp
  );
  const authHeader = "Basic " + Buffer.from(`${params.merchantPublicKey}:${params.apiPassword}`).toString("base64");

  let res: Response;
  try {
    res = await fetch(GEIDEA_SESSION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({
        amount: Number(formatAmount(params.amount)),
        currency: params.currency,
        timestamp,
        merchantReferenceId: params.merchantReferenceId,
        signature,
        callbackUrl: params.callbackUrl,
        returnUrl: params.returnUrl,
        language: params.language || "ar",
      }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }

  const data = (await res.json().catch(() => null)) as
    | { session?: { id?: string }; responseMessage?: string; detailedResponseMessage?: string }
    | null;
  if (!res.ok || !data?.session?.id) {
    // Geidea's raw error body must never reach the browser — the caller logs
    // this server-side and shows the customer a generic Arabic message.
    return { ok: false, error: data?.detailedResponseMessage || data?.responseMessage || `HTTP ${res.status}` };
  }

  return { ok: true, sessionId: data.session.id, redirectUrl: `${GEIDEA_CHECKOUT_BASE}?${data.session.id}` };
}

// ===== Callback signature verification =====
// FLAGGED — see the plan this was built from: this exact field order/casing
// came from a doc-summarization pass over
// docs.geidea.net/docs/sample-callback-responses, not a direct read of the
// raw doc text. Re-verify against the live docs (and ideally a real sandbox
// round-trip) before this is trusted in production — a wrong scheme here is
// a silent security hole. Fails closed on any mismatch or missing field,
// never fails open.
export function verifyGeideaCallbackSignature(payload: {
  merchantPublicKey: string;
  apiPassword: string;
  amount: string | number;
  currency: string;
  orderId: string;
  status: string;
  merchantReferenceId: string;
  timestamp: string;
  providedSignature: string;
}): boolean {
  if (!payload.providedSignature) return false;
  const amountStr = typeof payload.amount === "number" ? formatAmount(payload.amount) : payload.amount;
  const data = `${payload.merchantPublicKey}${amountStr}${payload.currency}${payload.orderId}${payload.status}${payload.merchantReferenceId}${payload.timestamp}`;
  const expected = createHmac("sha256", payload.apiPassword).update(data, "utf8").digest("base64");
  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(payload.providedSignature, "utf8");
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}
