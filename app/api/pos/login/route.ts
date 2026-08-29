import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rateLimit";

// H5 (security hardening phase 2) — the cashier PIN is only 4 digits
// (10,000 combinations), checked before this route existed by calling
// Supabase Auth's signInWithPassword() DIRECTLY from the browser, which
// never touches Rakeen's own Cloudflare Worker at all — no edge rate limit,
// and no per-branch attempt tracking, so nothing but Supabase's own
// account-wide auth throttling stood between an attacker and unlimited PIN
// guesses. This route proxies that one check server-side so it CAN be
// rate-limited (RL_POS_LOGIN, edge layer) and, more importantly, backed by
// a real per-branch progressive lockout (pos_login_attempts, DB layer —
// the layer that actually matters here, same lesson as the anon RPCs in
// 20260819081000_rate_limit_anon_rpcs.sql: don't assume Cloudflare
// protects something that used to bypass it entirely).
//
// Lockout schedule: unlocked for the first 5 failed attempts (real cashiers
// mistype), then locked for 2^(failures-5) minutes, capped at 60 minutes —
// 6th failure = 2 min, 7th = 4 min, 8th = 8 min... a genuine 10,000-value
// brute force is infeasible well before the cap. Counter resets to zero on
// any successful login. Deliberately returns the exact same generic error
// for "branch not found" / "locked out" / "wrong PIN" — the frontend can't
// distinguish which, so a script can't use the response to enumerate valid
// branch ids either.
const GENERIC_ERROR = "رمز الفرع غلط أو الحساب مقفل مؤقتًا — حاول بعد شوي";

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 });
  }

  const { branchId, pin } = await request.json().catch(() => ({}) as { branchId?: unknown; pin?: unknown });
  if (!branchId || typeof branchId !== "number" || !/^\d{4}$/.test(String(pin || ""))) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  if (!(await checkRateLimit(request, "RL_POS_LOGIN", String(branchId)))) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 429 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: attempt } = await admin
    .from("pos_login_attempts")
    .select("failed_count, locked_until")
    .eq("branch_id", branchId)
    .maybeSingle();

  if (attempt?.locked_until && new Date(attempt.locked_until) > new Date()) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 423 });
  }

  const email = `pos+${branchId}@rakeen.internal`;
  const password = `${pin}-pos`;
  const asCaller = createClient(supabaseUrl, anonKey);
  const { data, error } = await asCaller.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    const failedCount = (attempt?.failed_count || 0) + 1;
    const lockMinutes = failedCount > 5 ? Math.min(2 ** (failedCount - 5), 60) : 0;
    const lockedUntil = lockMinutes > 0 ? new Date(Date.now() + lockMinutes * 60000).toISOString() : null;
    await admin.from("pos_login_attempts").upsert({
      branch_id: branchId,
      failed_count: failedCount,
      locked_until: lockedUntil,
      last_attempt_at: new Date().toISOString(),
    });
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  // Success — clear the counter so a run of typos doesn't leave the branch
  // sitting near a lockout threshold for the rest of the day.
  await admin.from("pos_login_attempts").delete().eq("branch_id", branchId);

  return NextResponse.json({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
    userId: data.user.id,
  });
}
