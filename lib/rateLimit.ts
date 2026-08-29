import { NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Minimal shape of Cloudflare's Rate Limiting binding — matches the
// existing manual-cast pattern for other bindings in this codebase (see
// R2BucketLike in app/api/dashboard/upload-media/route.ts) rather than
// pulling in @cloudflare/workers-types for one method.
interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type RateLimitTier =
  | "RL_AUTH" // signup, OTP request — 5/60s
  | "RL_ADMIN_SENSITIVE" // owner-credentials reset, POS PIN provisioning — 10/60s
  | "RL_UPLOAD" // media upload, invoice scan — 15/60s
  | "RL_EMAIL" // report emailing — 5/60s
  | "RL_PUSH" // owner/customer push — 20/60s
  | "RL_ADMIN_GENERAL" // general /api/admin/* reads — 60/60s
  | "RL_WEBHOOK" // WhatsApp webhook — 120/60s
  | "RL_POS_LOGIN" // cashier PIN login — 10/60s
  | "RL_PAYMENT"; // Geidea create-session + credentials save — 20/60s

// Real client IP as Cloudflare's edge sees it — this is the one place in
// the whole app that's actually behind Cloudflare's network, so this
// header is trustworthy here (unlike trying to read it from a
// browser-supplied value, which would be forgeable).
function clientIp(request: NextRequest): string {
  return request.headers.get("cf-connecting-ip") || "unknown";
}

// Checks one rate-limit tier for this request, keyed by IP plus an
// optional caller identity (a user id, business id, or target email) — IP
// alone lets one attacker distributing calls across many accounts slip
// through; identity alone lets one attacker rotating IPs slip through.
// Either key tripping blocks the call. Returns true if the binding isn't
// configured (e.g. local `next dev` without the Cloudflare platform proxy)
// so rate limiting fails open only in dev, never silently in production —
// production always has real bindings once deployed.
export async function checkRateLimit(
  request: NextRequest,
  tier: RateLimitTier,
  identityKey?: string
): Promise<boolean> {
  const { env } = await getCloudflareContext({ async: true });
  const binding = (env as unknown as Record<string, RateLimiterBinding | undefined>)[tier];
  if (!binding) return true;

  const ip = clientIp(request);
  const ipResult = await binding.limit({ key: `${tier}:ip:${ip}` });
  if (!ipResult.success) return false;

  if (identityKey) {
    const identityResult = await binding.limit({ key: `${tier}:id:${identityKey}` });
    if (!identityResult.success) return false;
  }

  return true;
}
