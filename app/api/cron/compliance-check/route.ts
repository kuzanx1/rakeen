import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Fired by the Worker's Cron Trigger (worker-entrypoint.js's scheduled()
// handler) — recomputes every compliance_items.status from expiry_date so
// the HR screen's badges (and, later, an in-app alert) stay accurate day to
// day without an owner having to open the screen. Auth here is the same
// shared-secret header as /api/cron/daily-report, since this is never called
// by a real user session. Purely internal: expiry dates are typed in by the
// merchant, never fetched from a live GOSI/Muqeem lookup — see
// supabase/migrations/20260903030000_hr_employees_departments_compliance.sql.
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

  const { error } = await admin.rpc("check_compliance_expiries");
  if (error) {
    console.error("compliance-check: check_compliance_expiries failed", error);
    return NextResponse.json({ error: "check failed", details: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
