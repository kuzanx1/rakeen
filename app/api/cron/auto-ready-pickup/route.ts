import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Fired every couple minutes by the Worker's Cron Trigger (worker-entrypoint.js's
// scheduled() handler), never by a real user — same shared-secret pattern as
// the other app/api/cron/* routes. Sweeps online pickup orders whose promised
// ready-by time (scheduled_for) has passed and marks them ready, unless a
// cashier already beat it to it — see the RPC's own comment
// (supabase/migrations/20260830180000_auto_ready_online_pickup_sweep.sql).
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "server not configured" }, { status: 500 });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await admin.rpc("auto_ready_online_pickup_orders");
  if (error) {
    console.error("auto-ready-pickup: sweep failed", error);
    return NextResponse.json({ error: "sweep failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, marked_ready: Array.isArray(data) ? data.length : 0 });
}
