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

interface GeideaOrderFields {
  orderId?: string;
  amount?: string | number;
  currency?: string;
  merchantReferenceId?: string;
  status?: string;
  responseCode?: string;
  timestamp?: string;
  timeStamp?: string;
}
// Geidea's callback docs show the order fields inside a top-level `order`
// object with `signature` beside it; this route used to read them only from
// the top level, so a nested callback had no merchantReferenceId and was
// dropped without a word. Both shapes are read now. Nothing is loosened: the
// signature, the amount and responseCode "000" are all still required.
interface GeideaCallbackPayload extends GeideaOrderFields {
  order?: GeideaOrderFields;
  signature?: string;
  // a session-level callback (e.g. the customer let the payment page time
  // out) carries only these, with no order or merchantReferenceId
  sessionId?: string;
  orderStatus?: string;
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

  let payload: GeideaCallbackPayload | null = null;
  try {
    payload = JSON.parse(rawBody || "null");
  } catch {
    payload = null;
  }
  const o: GeideaOrderFields = payload?.order ?? payload ?? {};
  const merchantReferenceId = o.merchantReferenceId;
  if (!payload || !merchantReferenceId) {
    // Seen for real (2026-10-23): when the payment page times out Geidea
    // sends {sessionId, orderStatus: "TimeOut", signature, timeStamp} and no
    // order. Nothing was paid, so there's nothing to do; the order just stays
    // unpaid. Anything else here is unexpected and worth seeing whole.
    if (payload?.orderStatus) console.log("geidea webhook: session callback", payload.orderStatus);
    else console.error("geidea webhook: no merchantReferenceId", rawBody.slice(0, 2000));
    return NextResponse.json({ ok: true });
  }

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
    amount: o.amount ?? "",
    currency: o.currency ?? "",
    orderId: o.orderId ?? "",
    status: o.status ?? "",
    merchantReferenceId,
    timestamp: payload.timeStamp ?? payload.timestamp ?? o.timeStamp ?? o.timestamp ?? "",
    providedSignature: payload.signature ?? "",
  });
  if (!signatureValid) {
    // TEMP-DIAG: the raw callback (no secrets in it) so the signature scheme
    // can be checked against a real one. Remove once verified.
    console.error("geidea webhook: signature verification failed", { orderId: order.id }, rawBody.slice(0, 2000));
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // Defense in depth even after signature verification — the charged
  // amount must match what Rakeen itself computed, not just what the
  // payload claims.
  const payloadAmount = Number(o.amount);
  if (!Number.isFinite(payloadAmount) || payloadAmount.toFixed(2) !== Number(order.total).toFixed(2)) {
    console.error("geidea webhook: amount mismatch", { orderId: order.id, expected: order.total, got: o.amount });
    return NextResponse.json({ ok: true });
  }

  // Success = the order's status is "Success". That field is part of the
  // signature verified above, so it can't be forged without the merchant's
  // apiPassword. responseCode, which this route used to require, isn't
  // signed and isn't even sent: the first real test payment (order 32047,
  // 2026-10-23) arrived signed and correct with status "Success" and no
  // responseCode, and was left unpaid.
  const responseCode = payload.responseCode ?? o.responseCode;
  const paid = String(o.status || "").toLowerCase() === "success" || responseCode === "000";
  // TEMP-DIAG: the full callback for every outcome during the Geidea test
  // round (no secrets in it). Remove once Visa/Mastercard/Mada are confirmed.
  console.log("geidea webhook: verified callback", { orderId: order.id, paid }, rawBody.slice(0, 2000));
  if (paid && order.payment_status === "unpaid") {
    const { data: updated } = await admin
      .from("orders")
      .update({
        payment_status: "paid",
        status: "pending",
        cash_amount: order.total,
        gateway_reference: o.orderId ?? null,
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
