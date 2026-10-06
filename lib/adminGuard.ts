import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requiresStepUp } from "@/lib/adminAuth";
import { checkRateLimit, RateLimitTier } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";

// The same platform-admin gate every /api/admin route applies inline
// (allowlisted email + aal2 + both rate limiters), packaged once for the
// contracts routes. Returns either a ready service-role client and the
// caller's email, or the error response to send back as-is.
export async function requireAdmin(
  request: NextRequest,
  tier: RateLimitTier = "RL_ADMIN_GENERAL"
): Promise<{ admin: SupabaseClient; email: string } | { response: NextResponse }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { response: NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 }) };
  }

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { response: NextResponse.json({ error: "غير مصرّح" }, { status: 401 }) };

  const asCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const {
    data: { user: caller },
    error,
  } = await asCaller.auth.getUser(token);
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (error || !caller?.email || !allowed.includes(caller.email.toLowerCase())) {
    return { response: NextResponse.json({ error: "غير مصرّح" }, { status: 403 }) };
  }
  if (requiresStepUp(token)) {
    return { response: NextResponse.json({ error: "يلزم التحقق بخطوتين (MFA) لهذا الحساب" }, { status: 401 }) };
  }
  if (!(await checkRateLimit(request, tier, caller.email))) {
    return { response: NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 }) };
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);
  if (!(await checkDbRateLimit(admin, request, tier, 60, 60, caller.email))) {
    return { response: NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 }) };
  }
  return { admin, email: caller.email };
}
