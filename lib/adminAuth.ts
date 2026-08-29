import { SupabaseClient } from "@supabase/supabase-js";

// M5 (security hardening phase 2) — step-up MFA enforcement + an audit
// trail for the platform-admin console. Both were completely absent
// before: admin login was a plain email+password check (isAdminEmail),
// enforceable by anyone who obtained that one password, and no admin
// action anywhere left a record of who did what.

// Supabase encodes the session's Authenticator Assurance Level directly in
// the access token's `aal` claim (`aal1` = password only, `aal2` = password
// + a verified second factor). Decoding it here needs no extra network
// round-trip — the JWT is already in hand from the Authorization header.
export function getTokenAal(token: string): string | null {
  try {
    const payloadB64 = token.split(".")[1];
    if (!payloadB64) return null;
    const json = Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const payload = JSON.parse(json) as { aal?: string };
    return payload.aal || null;
  } catch {
    return null;
  }
}

// Every admin route requires aal2 — a password alone (aal1) is no longer
// enough, even for an allow-listed email. Enrollment/challenge lives in the
// admin dashboard's login flow (app/admin/AdminDashboard.tsx); this is the
// server-side half that actually matters, since client-side gating alone
// is trivially bypassed by calling the API directly.
export function requiresStepUp(token: string): boolean {
  return getTokenAal(token) !== "aal2";
}

// Never pass secrets/tokens/passwords in `metadata` — this table has no
// special protection beyond service-role-only access, same bar as any
// other internal table.
export async function logAdminAction(
  admin: SupabaseClient,
  actorEmail: string,
  action: string,
  target: string | null,
  result: "success" | "failure",
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await admin.from("admin_audit_log").insert({ actor_email: actorEmail, action, target, result, metadata: metadata || null });
  } catch (err) {
    // Logging must never block or fail the actual admin action.
    console.error("admin audit log insert failed", err);
  }
}
