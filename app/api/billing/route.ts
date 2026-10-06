import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";
import { ensureVapidConfigured, sendPushToSubscription } from "@/lib/push";
import { formatSar } from "@/lib/contracts";
import { getBank } from "@/lib/platformBank";

// The subscriber's side of their contract, for the owner of the business
// only (dashboard banner, app/dashboard/BillingNotice.tsx):
//   GET  → a contract waiting for their signature, their open payments,
//          and Rakeen's bank details.
//   POST → upload a transfer receipt for one payment (multipart:
//          payment_id, file). It only moves the payment to "submitted";
//          the platform admin confirms it by hand.
// Reads/writes go through the service role after the caller is resolved
// to their own business, so a subscriber can only ever see and touch the
// payments of contracts tied to their account.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RECEIPT = 8 * 1024 * 1024;

async function resolveOwner(request: NextRequest): Promise<{ admin: SupabaseClient; userId: string; businessId: number } | { response: NextResponse }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return { response: NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 }) };
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { response: NextResponse.json({ error: "غير مصرّح" }, { status: 401 }) };
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const {
    data: { user },
    error,
  } = await asCaller.auth.getUser(token);
  if (error || !user) return { response: NextResponse.json({ error: "غير مصرّح" }, { status: 401 }) };
  const admin = createClient(url, serviceKey);
  const { data: profile } = await admin.from("profiles").select("business_id, user_type, active").eq("id", user.id).maybeSingle();
  if (!profile || !profile.active || profile.user_type !== "owner" || !profile.business_id) {
    return { response: NextResponse.json({ error: "للمالك فقط" }, { status: 403 }) };
  }
  return { admin, userId: user.id, businessId: Number(profile.business_id) };
}

export async function GET(request: NextRequest) {
  const who = await resolveOwner(request);
  if ("response" in who) return who.response;
  if (!(await checkRateLimit(request, "RL_ADMIN_GENERAL", who.userId))) return NextResponse.json({ error: "محاولات كثيرة" }, { status: 429 });

  const { data: contracts } = await who.admin
    .from("subscription_contracts")
    .select("id, contract_number, token, status, expires_at, created_at")
    .eq("business_id", who.businessId)
    .neq("status", "void")
    .order("created_at", { ascending: false });

  const now = Date.now();
  const toSign = (contracts || []).find((c) => c.status === "sent" && Date.parse(c.expires_at) > now) || null;
  const signed = (contracts || []).filter((c) => c.status === "signed");
  const numberById = new Map(signed.map((c) => [c.id, c.contract_number]));

  let payments: unknown[] = [];
  if (signed.length) {
    const { data: pays } = await who.admin
      .from("contract_payments")
      .select("id, contract_id, seq, amount, due_date, status, review_note")
      .in("contract_id", signed.map((c) => c.id))
      .neq("status", "paid")
      .order("due_date")
      .limit(24);
    payments = (pays || []).map((p) => ({
      id: p.id,
      seq: p.seq,
      amount: Number(p.amount),
      due_date: p.due_date,
      status: p.status,
      review_note: p.review_note,
      contract_number: numberById.get(p.contract_id) || "",
    }));
  }

  const bank = await getBank(who.admin);
  return NextResponse.json({
    to_sign: toSign ? { contract_number: toSign.contract_number, token: toSign.token } : null,
    payments,
    bank: { name: bank.bankName, iban: bank.iban, holder: bank.accountHolder },
  });
}

export async function POST(request: NextRequest) {
  const who = await resolveOwner(request);
  if ("response" in who) return who.response;
  if (!(await checkRateLimit(request, "RL_UPLOAD", who.userId))) return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  if (!(await checkDbRateLimit(who.admin, request, "RL_UPLOAD", 15, 600, who.userId))) return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });

  const form = await request.formData().catch(() => null);
  const paymentId = form?.get("payment_id");
  const file = form?.get("file");
  if (typeof paymentId !== "string" || !UUID.test(paymentId)) return NextResponse.json({ error: "الدفعة غير موجودة" }, { status: 404 });
  if (!file || typeof file === "string") return NextResponse.json({ error: "ارفق صورة الإيصال" }, { status: 400 });
  if (file.size > MAX_RECEIPT) return NextResponse.json({ error: "حجم الملف أكبر من ٨ ميجا" }, { status: 400 });
  if (!["image/png", "image/jpeg", "application/pdf"].includes(file.type)) return NextResponse.json({ error: "الإيصال لازم صورة أو PDF" }, { status: 400 });

  const { data: pay } = await who.admin
    .from("contract_payments")
    .select("id, seq, amount, status, contract_id, subscription_contracts!inner(contract_number, status, business_id)")
    .eq("id", paymentId)
    .maybeSingle();
  const contract = (pay as unknown as { subscription_contracts?: { contract_number: string; status: string; business_id: number | null } } | null)?.subscription_contracts;
  if (!pay || !contract || Number(contract.business_id) !== who.businessId || contract.status !== "signed") {
    return NextResponse.json({ error: "الدفعة غير موجودة" }, { status: 404 });
  }
  if (pay.status === "paid") return NextResponse.json({ error: "هذي الدفعة مسددة ومؤكدة" }, { status: 409 });
  if (pay.status === "submitted") return NextResponse.json({ error: "إيصالك وصلنا وهو تحت المراجعة" }, { status: 409 });

  const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
  const path = `receipts/${pay.contract_id}/${pay.id}-${Date.now()}.${ext}`;
  const { error: upErr } = await who.admin.storage.from("contracts").upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
  if (upErr) return NextResponse.json({ error: "تعذر رفع الإيصال، حاول مرة ثانية" }, { status: 500 });

  const { data: updated } = await who.admin
    .from("contract_payments")
    .update({ status: "submitted", receipt_path: path, submitted_at: new Date().toISOString(), submitted_by: who.userId, review_note: null })
    .eq("id", pay.id)
    .in("status", ["due", "rejected"])
    .select("id")
    .maybeSingle();
  if (!updated) return NextResponse.json({ error: "تعذر حفظ الإيصال، حدّث الصفحة" }, { status: 409 });

  await notifyAdmins(who.admin, `${contract.contract_number} — الدفعة ${pay.seq} (${formatSar(Number(pay.amount))})`);
  return NextResponse.json({ ok: true });
}

async function notifyAdmins(admin: SupabaseClient, body: string) {
  try {
    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) return;
    const { data: subs } = await admin.from("admin_push_subscriptions").select("id, endpoint, p256dh, auth");
    if (!subs || subs.length === 0) return;
    ensureVapidConfigured(pub, priv);
    const payload = JSON.stringify({ title: "إيصال دفعة بانتظار موافقتك", body: body.slice(0, 180), url: "/admin" });
    await Promise.all(subs.map((sub) => sendPushToSubscription(sub, payload, admin, "admin_push_subscriptions")));
  } catch (err) {
    console.error("billing: admin push failed", err);
  }
}
