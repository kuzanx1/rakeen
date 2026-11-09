import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rateLimit";

// Asked by both cashiers only when a signed-in user's own profile came back
// empty, to tell a suspended business from a real loading failure. Answers
// for the caller's own business and nothing else.
export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 });

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const {
    data: { user },
    error,
  } = await createClient(url, anonKey).auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  if (!(await checkRateLimit(request, "RL_ADMIN_GENERAL", user.id))) {
    return NextResponse.json({ error: "محاولات كثيرة" }, { status: 429 });
  }

  const admin = createClient(url, serviceKey);
  const { data: profile } = await admin.from("profiles").select("business_id").eq("id", user.id).maybeSingle();
  if (!profile?.business_id) return NextResponse.json({ suspended: false });

  const { data: business } = await admin.from("businesses").select("is_active").eq("id", profile.business_id).maybeSingle();
  return NextResponse.json({ suspended: business?.is_active === false });
}
