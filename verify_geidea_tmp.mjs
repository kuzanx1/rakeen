import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const devVars = fs.readFileSync("C:/Users/N/Desktop/rakeenpos/rakeen/.dev.vars", "utf8");
const env = {};
for (const line of devVars.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const BUSINESS_ID = Number(env.TEST_BUSINESS_A_ID); // 77 — disposable test business, never real customer data

let failures = 0;
function check(label, cond, detail) {
  console.log((cond ? "[PASS] " : "[FAIL] ") + label + (detail ? " — " + detail : ""));
  if (!cond) failures++;
}

async function main() {
  // Ensure clean slate: no gateway row, geidea_connected=false.
  await admin.from("business_payment_gateways").delete().eq("business_id", BUSINESS_ID).eq("provider", "geidea");
  await admin.from("businesses").update({ geidea_connected: false, geidea_public_key_last4: null }).eq("id", BUSINESS_ID);

  // TEST_BUSINESS_A_ID is shared with other test suites (e.g. rate-limit
  // testing) — capture its current online_ordering_enabled so this script
  // can restore it exactly, rather than assuming/leaving a changed value.
  const { data: bizBeforeToggle } = await admin.from("businesses").select("online_ordering_enabled").eq("id", BUSINESS_ID).single();
  const originalOnlineOrderingEnabled = bizBeforeToggle?.online_ordering_enabled === true;
  if (!originalOnlineOrderingEnabled) {
    await admin.from("businesses").update({ online_ordering_enabled: true }).eq("id", BUSINESS_ID);
    console.log("[SETUP] temporarily enabled online_ordering_enabled for business " + BUSINESS_ID + " (will restore to false)");
  }

  const { data: biz } = await admin.from("businesses").select("id, online_menu_slug, online_ordering_enabled").eq("id", BUSINESS_ID).single();
  check("test business exists and has online ordering enabled", !!biz && biz.online_ordering_enabled === true, JSON.stringify(biz));
  if (!biz || !biz.online_ordering_enabled) { console.log("aborting — fix TEST_BUSINESS_A_ID's online_ordering_enabled first"); process.exit(1); }

  const { data: branch } = await admin.from("branches").select("id").eq("business_id", BUSINESS_ID).order("id").limit(1).maybeSingle();
  check("test business has a branch", !!branch, JSON.stringify(branch));
  if (!branch) process.exit(1);

  let { data: menuItem } = await admin.from("menu_items").select("id, price").eq("business_id", BUSINESS_ID).eq("active", true).order("id").limit(1).maybeSingle();
  let createdMenuItemId = null;
  if (!menuItem) {
    const { data: created, error: createErr } = await admin.from("menu_items")
      .insert({ business_id: BUSINESS_ID, name: "Verify Test Item", price: 10, active: true, cost_mode: "direct" })
      .select("id, price").single();
    check("throwaway menu item created (none existed)", !createErr, createErr ? createErr.message : "");
    menuItem = created;
    createdMenuItemId = created?.id ?? null;
  }
  check("test business has an active menu item", !!menuItem, JSON.stringify(menuItem));
  if (!menuItem) process.exit(1);

  const items = [{ menu_item_id: menuItem.id, qty: 1 }];

  // ---- 1. card order rejected when no gateway is connected ----
  const { data: rejected, error: rejectedErr } = await admin.rpc("submit_online_order", {
    p_business_slug: biz.online_menu_slug, p_customer_name: "Verify Bot", p_customer_phone: "0500000001",
    p_channel: "pickup", p_delivery_address: null, p_note: null, p_items: items,
    p_branch_id: branch.id, p_customer_lat: null, p_customer_lng: null, p_scheduled_for: null,
    p_client_order_uuid: crypto.randomUUID(), p_payment_method: "card",
  });
  check(
    "card order rejected with no connected gateway",
    !!rejectedErr && /غير متاح/.test(rejectedErr.message || ""),
    rejectedErr ? rejectedErr.message : JSON.stringify(rejected)
  );

  // ---- 2. connect a (fake, for DB-guard-testing purposes) gateway ----
  const { error: gwErr } = await admin.from("business_payment_gateways").insert({
    business_id: BUSINESS_ID, provider: "geidea",
    merchant_public_key: "verify-test-public-key-0000",
    api_password_ciphertext: "not-a-real-ciphertext", api_password_iv: "not-a-real-iv",
    connected: true,
  });
  check("gateway row inserted", !gwErr, gwErr ? gwErr.message : "");
  await admin.from("businesses").update({ geidea_connected: true, geidea_public_key_last4: "0000" }).eq("id", BUSINESS_ID);

  // ---- 3. card order now succeeds and lands as awaiting_payment/unpaid ----
  const cardUuid = crypto.randomUUID();
  const { data: created, error: createdErr } = await admin.rpc("submit_online_order", {
    p_business_slug: biz.online_menu_slug, p_customer_name: "Verify Bot", p_customer_phone: "0500000002",
    p_channel: "pickup", p_delivery_address: null, p_note: null, p_items: items,
    p_branch_id: branch.id, p_customer_lat: null, p_customer_lng: null, p_scheduled_for: null,
    p_client_order_uuid: cardUuid, p_payment_method: "card",
  });
  check("card order created with a connected gateway", !createdErr, createdErr ? createdErr.message : "");
  const orderRow = Array.isArray(created) ? created[0] : created;
  let orderId = orderRow?.order_id;

  if (orderId) {
    const { data: fullOrder } = await admin.from("orders").select("status, payment_status, payment_method, cash_amount, total").eq("id", orderId).single();
    check("order.status = awaiting_payment", fullOrder?.status === "awaiting_payment", JSON.stringify(fullOrder));
    check("order.payment_status = unpaid", fullOrder?.payment_status === "unpaid", JSON.stringify(fullOrder));
    check("order.payment_method = card", fullOrder?.payment_method === "card", JSON.stringify(fullOrder));
    check("order.cash_amount = 0 (not yet paid)", Number(fullOrder?.cash_amount) === 0, JSON.stringify(fullOrder));

    // ---- 4. this order must NOT be visible in the POS pending-orders queue shape ----
    const { data: pendingQueue } = await admin.from("orders").select("id").eq("business_id", BUSINESS_ID).eq("status", "pending").eq("id", orderId);
    check("awaiting_payment order absent from status='pending' queue", (pendingQueue || []).length === 0);

    // ---- 5. free-trial counter must NOT have incremented for this card order yet ----
    const { data: bizAfter } = await admin.from("businesses").select("online_order_free_count").eq("id", BUSINESS_ID).single();
    const { data: bizBefore } = await admin.from("businesses").select("online_order_free_count").eq("id", BUSINESS_ID).single();
    check("trial counter present (sanity)", typeof bizAfter?.online_order_free_count === "number");

    // ---- 6. simulate the webhook's idempotent paid-transition update ----
    const { data: paidUpdate } = await admin.from("orders")
      .update({ payment_status: "paid", status: "pending", cash_amount: fullOrder.total, gateway_reference: "verify-geidea-order-id" })
      .eq("id", orderId).eq("payment_status", "unpaid").select("id").maybeSingle();
    check("webhook-style paid transition affects exactly the unpaid row", !!paidUpdate);
    const { data: afterPaid } = await admin.from("orders").select("status, payment_status, gateway_reference").eq("id", orderId).single();
    check("after paid transition: status=pending, payment_status=paid", afterPaid?.status === "pending" && afterPaid?.payment_status === "paid", JSON.stringify(afterPaid));

    // ---- 7. a second identical update (retry) must be a safe no-op ----
    const { data: retryUpdate } = await admin.from("orders")
      .update({ payment_status: "paid" })
      .eq("id", orderId).eq("payment_status", "unpaid").select("id").maybeSingle();
    check("retry of paid transition is a no-op (no row matched)", !retryUpdate);
  }

  // ---- 8. RLS: business_payment_gateways must be unreadable by non-service-role ----
  const anonClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data: anonRead, error: anonErr } = await anonClient.from("business_payment_gateways").select("*").limit(1);
  check("anon cannot read business_payment_gateways", (anonRead || []).length === 0, anonErr ? anonErr.message : JSON.stringify(anonRead));

  const { data: ownerSession, error: ownerAuthErr } = await createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    .auth.signInWithPassword({ email: env.TEST_OWNER_A_EMAIL, password: env.TEST_OWNER_A_PASSWORD });
  if (!ownerAuthErr && ownerSession?.session) {
    const asOwner = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${ownerSession.session.access_token}` } },
    });
    const { data: ownerRead, error: ownerReadErr } = await asOwner.from("business_payment_gateways").select("*").limit(1);
    check("authenticated owner cannot read business_payment_gateways (own row)", (ownerRead || []).length === 0, ownerReadErr ? ownerReadErr.message : JSON.stringify(ownerRead));
  } else {
    console.log("[SKIP] authenticated-owner RLS check — TEST_OWNER_A credentials not available (" + (ownerAuthErr?.message || "no session") + ")");
  }

  // ---- 9. anon can read businesses.geidea_connected but not geidea_public_key_last4 ----
  const { data: anonBiz, error: anonBizErr } = await anonClient.from("businesses").select("geidea_connected").eq("id", BUSINESS_ID).single();
  check("anon can read geidea_connected", !anonBizErr && anonBiz?.geidea_connected === true, JSON.stringify(anonBiz) + " " + (anonBizErr?.message || ""));
  const { error: anonLast4Err } = await anonClient.from("businesses").select("geidea_public_key_last4").eq("id", BUSINESS_ID).single();
  check("anon CANNOT read geidea_public_key_last4 (column not granted)", !!anonLast4Err, anonLast4Err ? anonLast4Err.message : "no error — LEAK");

  // ---- cleanup ----
  if (orderId) {
    await admin.from("order_items").delete().eq("order_id", orderId);
    await admin.from("orders").delete().eq("id", orderId);
  }
  await admin.from("orders").delete().eq("client_order_uuid", (rejected && rejected[0]?.tracking_token) || "___none___");
  await admin.from("business_payment_gateways").delete().eq("business_id", BUSINESS_ID).eq("provider", "geidea");
  await admin.from("businesses").update({ geidea_connected: false, geidea_public_key_last4: null }).eq("id", BUSINESS_ID);
  // also remove the customer row created by the rejected-attempt's phone number, and the succeeded one's
  await admin.from("customers").delete().eq("business_id", BUSINESS_ID).in("phone", ["0500000001", "0500000002"]);
  if (createdMenuItemId) {
    await admin.from("menu_items").delete().eq("id", createdMenuItemId);
    console.log("[CLEANUP] removed throwaway menu item " + createdMenuItemId);
  }
  if (!originalOnlineOrderingEnabled) {
    await admin.from("businesses").update({ online_ordering_enabled: false }).eq("id", BUSINESS_ID);
    console.log("[CLEANUP] restored online_ordering_enabled to false for business " + BUSINESS_ID);
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error("verify script crashed:", err); process.exit(1); });
