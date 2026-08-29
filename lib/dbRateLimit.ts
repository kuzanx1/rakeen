import { NextRequest } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

// H3 follow-up — Cloudflare's Rate Limiting binding is documented as
// "per Cloudflare location, eventually consistent, not designed to be an
// accurate accounting system" (developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
// It stays deployed as one defense-in-depth layer, but the check_rate_limit()
// Postgres function (already proven for the anon RPCs) is the only layer
// with a single, globally-consistent counter — this wires it into every
// sensitive Next.js API route too, so the DB is the real global enforcement
// layer regardless of which edge location a request lands on.
//
// Keys are hashed (SHA-256, truncated) before ever reaching rate_limit_hits
// — enforcement only needs key equality, not the raw value, so there is no
// reason to store a raw IP or business identifier in a table.

function hashKeyPart(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function clientIp(request: NextRequest): string {
  return request.headers.get("cf-connecting-ip") || "unknown";
}

// Checks one tier for this request, keyed by hashed IP plus an optional
// hashed identity (business id, caller email, etc.) — IP alone lets one
// attacker distribute across many accounts; identity alone lets one
// attacker rotate IPs. Either tripping blocks the call, matching the same
// two-key shape already proven for the anon RPCs.
export async function checkDbRateLimit(
  admin: SupabaseClient,
  request: NextRequest,
  tier: string,
  max: number,
  windowSeconds: number,
  identity?: string
): Promise<boolean> {
  const ipKey = `${tier}:ip:${hashKeyPart(clientIp(request))}`;
  const { data: ipOk, error: ipErr } = await admin.rpc("check_rate_limit", { p_key: ipKey, p_max: max, p_window_seconds: windowSeconds });
  if (ipErr) {
    // Fail open on an infrastructure error — a broken rate limiter must
    // never become an outage for real users. Logged so it's visible.
    console.error("checkDbRateLimit: RPC error (failing open)", ipErr.message);
    return true;
  }
  if (!ipOk) return false;

  if (identity) {
    const idKey = `${tier}:id:${hashKeyPart(identity)}`;
    const { data: idOk, error: idErr } = await admin.rpc("check_rate_limit", { p_key: idKey, p_max: max, p_window_seconds: windowSeconds });
    if (idErr) {
      console.error("checkDbRateLimit: RPC error (failing open)", idErr.message);
      return true;
    }
    if (!idOk) return false;
  }

  return true;
}
