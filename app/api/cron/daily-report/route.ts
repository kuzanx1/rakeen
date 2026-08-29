import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Fired by the Worker's Cron Trigger at 21:00 UTC = 00:00 Asia/Riyadh
// (worker-entrypoint.js's scheduled() handler) — every business gets
// yesterday's full financial report computed and saved automatically, no
// owner action needed. Auth here is a shared secret header, same pattern as
// /api/cron/win-back, since this is never called by a real user session.
//
// All the actual computation lives in the generate_daily_reports() Postgres
// function (see its migration) — this route is just the trigger + date math.
// It used to loop over every business here instead, issuing ~10 Supabase
// REST calls per business from this Worker; past ~20 businesses that hit
// Cloudflare's "too many subrequests per Worker invocation" ceiling and
// every business after that point failed outright. A single RPC call is one
// subrequest no matter how much work Postgres does inside it.
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

  // Riyadh is UTC+3 year-round (no DST), and this route only ever runs from
  // the 21:00 UTC Cron Trigger — so "the Riyadh calendar day that just
  // ended" is always exactly [now-24h, now) in UTC, and its Riyadh-local
  // date is (now - 24h) shifted forward 3h.
  const dayEnd = new Date();
  const dayStart = new Date(dayEnd.getTime() - 24 * 60 * 60 * 1000);
  const reportDate = new Date(dayStart.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: count, error } = await admin.rpc("generate_daily_reports", {
    p_report_date: reportDate,
    p_day_start: dayStart.toISOString(),
    p_day_end: dayEnd.toISOString(),
  });
  if (error) {
    console.error("daily-report: generate_daily_reports failed", error);
    return NextResponse.json({ error: "generation failed", details: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reportDate, businessesProcessed: count });
}
