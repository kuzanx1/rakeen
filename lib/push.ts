import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

let vapidConfigured = false;
export function ensureVapidConfigured(publicKey: string, privateKey: string) {
  if (vapidConfigured) return;
  webpush.setVapidDetails("mailto:anoobksaa@gmail.com", publicKey, privateKey);
  vapidConfigured = true;
}

type Subscription = { id: number; endpoint: string; p256dh: string; auth: string };

// web-push's own sendNotification() shells out to Node's `https` module, which
// Cloudflare Workers' nodejs_compat layer doesn't implement — only fetch() is
// supported there. generateRequestDetails() builds the signed VAPID request
// (headers + encrypted body) without sending it, so we dispatch it via fetch.
export async function sendPushToSubscription(
  sub: Subscription,
  payload: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  // which table to delete from on 404/410 — callers share this helper across
  // customer (push_subscriptions) and owner (owner_push_subscriptions) tables,
  // so this can't be hardcoded without risking deleting the wrong row.
  table: string = "push_subscriptions"
): Promise<boolean> {
  const details = webpush.generateRequestDetails(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    payload
  );
  const headers = { ...details.headers } as Record<string, string>;
  delete headers["Content-Length"];
  const res = await fetch(details.endpoint, { method: details.method, headers, body: new Uint8Array(details.body) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("push: request failed", { status: res.status, text, endpoint: sub.endpoint });
    if (res.status === 404 || res.status === 410) {
      // subscription expired/revoked on the browser side — stop tracking it
      await admin.from(table).delete().eq("id", sub.id);
    }
    return false;
  }
  return true;
}
