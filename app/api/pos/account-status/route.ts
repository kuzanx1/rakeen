import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rateLimit";
import { Renewal, Subscription, pickRenewal, pickSubscription } from "@/lib/renewalStage";

// Asked by both cashiers only when a signed-in user's own profile came back
// empty, to tell a suspended business from a real loading failure. Answers
// for the caller's own business and nothing else.
//
// It now also answers "is a renewal coming up?", for the reminder both
// cashiers show before the account is ever paused (RenewalNotice.tsx in the
// app, rkRenewal* in rakeen-pos.js). One route, called by both, so the
// stage machine (lib/renewalStage.ts) is the only copy of this rule — the
// dashboard's own BillingNotice.tsx has its own because it also needs the
// amount, the bank and the upload form, none of which the cashier may see.
//
// It answers two things from one read: `renewal` -- the staged reminder,
// silent most of the month -- and `subscription`, the plain "how many days
// are left" the More screen shows all the time, which has no window and no
// stage. The owner asked for both: one to warn, one to be there.
//
// The cashier is told WHEN, never HOW MUCH: a till stands in front of
// customers and staff, and the subscription price is the owner's business.
// No amount, no contract number, no IBAN crosses this boundary.

type Answer = { renewal: Renewal | null; subscription: Subscription | null };
const SILENT: Answer = { renewal: null, subscription: null };

async function renewalFor(admin: SupabaseClient, businessId: number): Promise<Answer> {
  const { data: contracts } = await admin
    .from("subscription_contracts")
    .select("id")
    .eq("business_id", businessId)
    .eq("status", "signed");
  if (!contracts || !contracts.length) return SILENT;

  const { data: pays } = await admin
    .from("contract_payments")
    .select("due_date, status")
    .in("contract_id", contracts.map((c) => c.id))
    .neq("status", "paid")
    .order("due_date")
    .limit(24);

  /**
   * قراءةٌ واحدةٌ، جوابان: «هل يُذكَّر الآن؟» و«كم باقي؟».
   *
   * نفسُ صفوفِ الدفعات تُجيب الاثنين، فلا يفترقان أبداً -- عدّادٌ يقول
   * «باقي ٤» وشريطٌ ساكتٌ لأنّ أحدَهما قرأ صفّاً والآخرُ غيرَه هو أسوأُ
   * ما قد يراه صاحبُ المطعم على كاشيره.
   */
  const now = Date.now();
  return { renewal: pickRenewal(pays || [], now), subscription: pickSubscription(pays || [], now) };
}

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
  if (!profile?.business_id) return NextResponse.json({ suspended: false, ...SILENT });

  const businessId = Number(profile.business_id);
  const { data: business } = await admin.from("businesses").select("is_active").eq("id", businessId).maybeSingle();
  const suspended = business?.is_active === false;

  /**
   * A suspended till says its one thing and nothing else: the reminder is
   * about keeping the service from stopping, and it has already stopped.
   *
   * And a failure here is silence, not an error: the renewal notice is a
   * courtesy, and no courtesy is worth breaking the suspension check that
   * both cashiers depend on to tell "paused" from "offline".
   */
  const answer = suspended ? SILENT : await renewalFor(admin, businessId).catch(() => SILENT);
  return NextResponse.json({ suspended, ...answer });
}
