import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";
import { ensureVapidConfigured, sendPushToSubscription } from "@/lib/push";
import {
  buildClauses,
  canonicalJson,
  ContractOffer,
  RAKEEN_PARTY,
  sha256Hex,
  TERMS_VERSION,
  validateParty,
} from "@/lib/contracts";

// Public, token-authenticated endpoints behind the signing link. The token
// (192 random bits) is the only credential; the offer itself is always
// read from the row here — never trusted from the client.

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
const MAX_SIGNATURE_BYTES = 300 * 1024;

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key) : null;
}

type Row = {
  id: string;
  contract_number: string;
  status: "sent" | "signed" | "void";
  plan_name: string;
  billing_period: "monthly" | "annual";
  price: number;
  setup_fee: number;
  vat_mode: "exclusive" | "inclusive";
  start_date: string;
  branches_count: number;
  features: string[];
  special_terms: string | null;
  expires_at: string;
  prefill_business_name: string | null;
  prefill_owner_name: string | null;
  prefill_phone: string | null;
  signed_at: string | null;
  terms_snapshot: unknown;
  signature_png: string | null;
  document_hash: string | null;
  pdf_path: string | null;
};

function offerOf(row: Row): ContractOffer {
  return {
    contract_number: row.contract_number,
    plan_name: row.plan_name,
    billing_period: row.billing_period,
    price: Number(row.price),
    setup_fee: Number(row.setup_fee),
    vat_mode: row.vat_mode,
    start_date: row.start_date,
    branches_count: row.branches_count,
    features: row.features,
    special_terms: row.special_terms,
  };
}

async function load(admin: SupabaseClient, token: string): Promise<Row | null> {
  const { data } = await admin.from("subscription_contracts").select("*").eq("token", token).maybeSingle();
  return (data as Row) || null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN.test(token)) return NextResponse.json({ error: "الرابط غير صحيح" }, { status: 404 });
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 });
  if (!(await checkRateLimit(request, "RL_ADMIN_GENERAL", token))) return NextResponse.json({ error: "محاولات كثيرة" }, { status: 429 });

  const row = await load(admin, token);
  if (!row || row.status === "void") return NextResponse.json({ error: "الرابط غير صالح أو تم إلغاؤه" }, { status: 404 });

  if (row.status === "signed") {
    // Signed: hand back the frozen snapshot so the subscriber can re-open
    // and re-download their copy from the same link.
    return NextResponse.json({
      status: "signed",
      snapshot: row.terms_snapshot,
      signature_png: row.signature_png,
      document_hash: row.document_hash,
      pdf_saved: !!row.pdf_path,
    });
  }
  if (Date.parse(row.expires_at) < Date.now()) return NextResponse.json({ error: "انتهت صلاحية الرابط، تواصل مع ركين لرابط جديد" }, { status: 410 });

  return NextResponse.json({
    status: "sent",
    offer: offerOf(row),
    clauses: buildClauses(offerOf(row)),
    terms_version: TERMS_VERSION,
    rakeen: RAKEEN_PARTY,
    prefill: { business_name: row.prefill_business_name, owner_name: row.prefill_owner_name, phone: row.prefill_phone },
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN.test(token)) return NextResponse.json({ error: "الرابط غير صحيح" }, { status: 404 });
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 });
  if (!(await checkRateLimit(request, "RL_ADMIN_SENSITIVE", token))) return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  if (!(await checkDbRateLimit(admin, request, "RL_CONTRACT_SIGN", 10, 600, token))) return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });

  const row = await load(admin, token);
  if (!row || row.status === "void") return NextResponse.json({ error: "الرابط غير صالح أو تم إلغاؤه" }, { status: 404 });
  if (row.status === "signed") return NextResponse.json({ error: "هذا العقد موقّع مسبقًا" }, { status: 409 });
  if (Date.parse(row.expires_at) < Date.now()) return NextResponse.json({ error: "انتهت صلاحية الرابط" }, { status: 410 });

  const { party, error: partyError } = validateParty(body as Record<string, unknown>);
  if (!party) return NextResponse.json({ error: partyError }, { status: 400 });

  if (body.agree !== true) return NextResponse.json({ error: "لازم توافق على بنود العقد" }, { status: 400 });
  const typed = typeof body.typed_name === "string" ? body.typed_name.trim().replace(/\s+/g, " ") : "";
  if (typed !== party.owner_name.replace(/\s+/g, " ")) return NextResponse.json({ error: "اكتب اسمك بنفس الاسم المكتوب في بيانات الممثل" }, { status: 400 });

  const signature = typeof body.signature_png === "string" ? body.signature_png : "";
  if (!signature.startsWith("data:image/png;base64,") || signature.length > MAX_SIGNATURE_BYTES * 1.4) {
    return NextResponse.json({ error: "التوقيع غير صالح، وقّع مرة ثانية" }, { status: 400 });
  }

  const offer = offerOf(row);
  const signedAt = new Date().toISOString();
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const userAgent = (request.headers.get("user-agent") || "").slice(0, 400);
  const snapshot = {
    terms_version: TERMS_VERSION,
    rakeen: RAKEEN_PARTY,
    offer,
    party,
    clauses: buildClauses(offer),
    signed_at: signedAt,
    signer_ip: ip,
  };
  const documentHash = await sha256Hex(canonicalJson({ snapshot, signature_png: signature }));

  // status=sent guard makes a double-submit (two taps, two tabs) a no-op
  // instead of overwriting the first signature.
  const { data: updated, error } = await admin
    .from("subscription_contracts")
    .update({
      ...party,
      cr_number: party.cr_number || null,
      vat_number: party.vat_number || null,
      status: "signed",
      signature_png: signature,
      signed_at: signedAt,
      signer_ip: ip,
      signer_user_agent: userAgent,
      terms_version: TERMS_VERSION,
      terms_snapshot: snapshot,
      document_hash: documentHash,
    })
    .eq("id", row.id)
    .eq("status", "sent")
    .select("id")
    .maybeSingle();
  if (error || !updated) return NextResponse.json({ error: "تعذر حفظ التوقيع، حاول مرة ثانية" }, { status: 409 });

  await notifyAdmins(admin, `${party.business_name} — ${party.owner_name}`, row.contract_number);
  return NextResponse.json({ ok: true, snapshot, signature_png: signature, document_hash: documentHash });
}

async function notifyAdmins(admin: SupabaseClient, who: string, contractNumber: string) {
  try {
    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) return;
    const { data: subs } = await admin.from("admin_push_subscriptions").select("id, endpoint, p256dh, auth");
    if (!subs || subs.length === 0) return;
    ensureVapidConfigured(pub, priv);
    const payload = JSON.stringify({ title: "✍️ عقد جديد انوقّع", body: `${contractNumber} — ${who}`.slice(0, 180), url: "/admin" });
    await Promise.all(subs.map((sub) => sendPushToSubscription(sub, payload, admin, "admin_push_subscriptions")));
  } catch (err) {
    console.error("contract sign: admin push failed", err);
  }
}
