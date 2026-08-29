import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";
import { decryptSecret, verifyGeideaCallbackSignature } from "@/lib/geidea";

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

interface GeideaCallbackPayload {
  orderId?: string;
  amount?: string | number;
  currency?: string;
  merchantReferenceId?: string;
  status?: string;
  responseCode?: string;
  timestamp?: string;
  signature?: string;
}

// Geidea's per-merchant signing secret (apiPassword) means — unlike the
// WhatsApp webhook's one global WHATSAPP_APP_SECRET — this route must first
// figure out WHICH business a callback belongs to before it knows which
// secret to verify against. The only safe way to do that is to look up the
// order Rakeen itself already created (by tracking_token, which Rakeen
// chose as merchantReferenceId) and trust ONLY that lookup's business_id —
// never any business-identifying field the payload itself might claim.
// This is the anti-spoofing structure the whole design rests on.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!(await checkRateLimit(request, "RL_WEBHOOK"))) {
    return NextResponse.json({ ok: true });
  }
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: true });
  if (!(await checkDbRateLimit(admin, request, "RL_WEBHOOK", 120, 60))) {
    return NextResponse.json({ ok: true });
  }

  const payload = JSON.parse(rawBody || "null") as GeideaCallbackPayload | null;
  const merchantReferenceId = payload?.merchantReferenceId;
  if (!payload || !merchantReferenceId) return NextResponse.json({ ok: true });

  const { data: order } = await admin
    .from("orders")
    .select("id, business_id, total, status, payment_status, tracking_token")
    .eq("tracking_token", merchantReferenceId)
    .maybeSingle();
  if (!order) {
    console.error("geidea webhook: unknown merchantReferenceId", merchantReferenceId);
    return NextResponse.json({ ok: true });
  }

  const { data: gateway } = await admin
    .from("business_payment_gateways")
    .select("merchant_public_key, api_password_ciphertext, api_password_iv")
    .eq("business_id", order.business_id).eq("provider", "geidea").maybeSingle();
  if (!gateway) {
    console.error("geidea webhook: no gateway configured for business", order.business_id);
    return NextResponse.json({ ok: true });
  }

  let apiPassword: string;
  try {
    apiPassword = await decryptSecret(gateway.api_password_ciphertext, gateway.api_password_iv);
  } catch (err) {
    console.error("geidea webhook: decrypt failed", err);
    return NextResponse.json({ ok: true });
  }

  const signatureValid = verifyGeideaCallbackSignature({
    merchantPublicKey: gateway.merchant_public_key,
    apiPassword,
    amount: payload.amount ?? "",
    currency: payload.currency ?? "",
    orderId: payload.orderId ?? "",
    status: payload.status ?? "",
    merchantReferenceId,
    timestamp: payload.timestamp ?? "",
    providedSignature: payload.signature ?? "",
  });
  if (!signatureValid) {
    console.error("geidea webhook: signature verification failed", { orderId: order.id });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // Defense in depth even after signature verification — the charged
  // amount must match what Rakeen itself computed, not just what the
  // payload claims.
  const payloadAmount = Number(payload.amount);
  if (!Number.isFinite(payloadAmount) || payloadAmount.toFixed(2) !== Number(order.total).toFixed(2)) {
    console.error("geidea webhook: amount mismatch", { orderId: order.id, expected: order.total, got: payload.amount });
    return NextResponse.json({ ok: true });
  }

  if (payload.responseCode === "000" && order.payment_status === "unpaid") {
    const { data: updated } = await admin
      .from("orders")
      .update({
        payment_status: "paid",
        status: "pending",
        cash_amount: order.total,
        gateway_reference: payload.orderId ?? null,
      })
      .eq("id", order.id).eq("payment_status", "unpaid")
      .select("id").maybeSingle();

    // Only affected a row on the first successful callback for this order —
    // a Geidea retry of an already-paid order is a safe no-op both here and
    // for the trial-count increment below. Deferred from submit_online_order
    // (see that function) so an abandoned/declined card checkout never
    // burns a free order.
    if (updated) {
      await admin.rpc("increment_online_order_free_count", { p_business_id: order.business_id });
    }
  }

  return NextResponse.json({ ok: true });
}
