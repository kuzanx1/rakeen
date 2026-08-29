import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";
import { createGeideaSession, decryptSecret } from "@/lib/geidea";

// Called right after submit_online_order() returns for a p_payment_method
// 'card' order — never before, since this route needs a real, already-
// priced order row to build a Geidea session against. apiPassword must
// never reach the browser (Geidea's own docs are explicit about this), so
// this whole call happens server-side with the service-role client; the
// storefront only ever gets back {sessionId, redirectUrl}.
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const body = await request.json().catch(() => null);
  const orderId = body?.order_id;
  const trackingToken = body?.tracking_token;
  if (!orderId || !trackingToken) {
    return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
  }

  // Identity-keyed on the tracking token — the one thing the client
  // legitimately controls here — plus the edge IP layer, mirroring every
  // other sensitive route's two-key shape.
  if (!(await checkRateLimit(request, "RL_PAYMENT", String(trackingToken)))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }
  if (!(await checkDbRateLimit(admin, request, "RL_PAYMENT", 20, 60, String(trackingToken)))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  // Trust nothing about money from the client — re-fetch the order by BOTH
  // id and tracking_token (a capability pair), and use its already-computed
  // total as the single source of truth. No second "compute the real total"
  // path exists here.
  const { data: order } = await admin
    .from("orders")
    .select("id, business_id, total, status, payment_status, tracking_token")
    .eq("id", orderId).eq("tracking_token", trackingToken).maybeSingle();
  if (!order) {
    return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
  }
  if (order.status !== "awaiting_payment" || order.payment_status !== "unpaid") {
    return NextResponse.json({ error: "هذا الطلب ليس بانتظار الدفع" }, { status: 400 });
  }

  const { data: gateway } = await admin
    .from("business_payment_gateways")
    .select("merchant_public_key, api_password_ciphertext, api_password_iv, connected")
    .eq("business_id", order.business_id).eq("provider", "geidea").maybeSingle();
  if (!gateway || !gateway.connected) {
    return NextResponse.json({ error: "الدفع بالبطاقة غير متاح لهذا المطعم" }, { status: 400 });
  }

  let apiPassword: string;
  try {
    apiPassword = await decryptSecret(gateway.api_password_ciphertext, gateway.api_password_iv);
  } catch (err) {
    console.error("geidea create-session: decrypt failed", err);
    return NextResponse.json({ error: "تعذر بدء عملية الدفع، حاول مرة ثانية" }, { status: 500 });
  }

  const origin = request.nextUrl.origin;
  const result = await createGeideaSession({
    merchantPublicKey: gateway.merchant_public_key,
    apiPassword,
    amount: Number(order.total),
    currency: "SAR",
    merchantReferenceId: String(order.tracking_token),
    callbackUrl: `${origin}/api/webhooks/geidea`,
    returnUrl: `${origin}/order-status/${order.tracking_token}`,
    language: "ar",
  });

  if (!result.ok) {
    console.error("geidea create-session: gateway rejected request", { businessId: order.business_id, error: result.error });
    return NextResponse.json({ error: "تعذر بدء عملية الدفع، حاول مرة ثانية" }, { status: 502 });
  }

  return NextResponse.json({ sessionId: result.sessionId, redirectUrl: result.redirectUrl });
}
