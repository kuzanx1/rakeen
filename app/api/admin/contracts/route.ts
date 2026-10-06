import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAuth";
import { isFeatureKey, normalizePhone, validateSchedule } from "@/lib/contracts";

// Platform-admin contracts: list + create. Creating a contract mints a
// one-off signing link (/contract/<token>) to send to the subscriber, tied
// to the subscriber's account (business_id) with its payment schedule.

const LIST_COLUMNS =
  "id, contract_number, token, status, plan_name, billing_period, price, setup_fee, vat_mode, jurisdiction, start_date, branches_count, features, expires_at, prefill_business_name, prefill_owner_name, prefill_phone, business_name, owner_name, phone, email, signed_at, pdf_path, uploaded_file_path, created_at, voided_at, business_id";

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ("response" in guard) return guard.response;
  const { data, error } = await guard.admin
    .from("subscription_contracts")
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: "تعذر تحميل العقود" }, { status: 500 });

  const ids = (data || []).map((c) => c.id);
  const bizIds = Array.from(new Set((data || []).map((c) => c.business_id).filter((v): v is number => v != null)));
  const [{ data: pays, error: payErr }, { data: bizs }] = await Promise.all([
    ids.length
      ? guard.admin.from("contract_payments").select("id, contract_id, seq, amount, due_date, status").in("contract_id", ids).order("seq")
      : Promise.resolve({ data: [], error: null }),
    bizIds.length ? guard.admin.from("businesses").select("id, name").in("id", bizIds) : Promise.resolve({ data: [] }),
  ]);
  if (payErr) return NextResponse.json({ error: "تعذر تحميل الدفعات" }, { status: 500 });
  const nameById = new Map((bizs || []).map((b) => [Number(b.id), String(b.name)]));
  const paysByContract = new Map<string, unknown[]>();
  (pays || []).forEach((p) => {
    const list = paysByContract.get(p.contract_id) || [];
    list.push({ id: p.id, seq: p.seq, amount: Number(p.amount), due_date: p.due_date, status: p.status });
    paysByContract.set(p.contract_id, list);
  });
  const contracts = (data || []).map((c) => ({
    ...c,
    account_name: c.business_id != null ? nameById.get(Number(c.business_id)) || null : null,
    payments: paysByContract.get(c.id) || [],
  }));
  return NextResponse.json({ contracts });
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request, "RL_ADMIN_SENSITIVE");
  if ("response" in guard) return guard.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

  const plan_name = str(body.plan_name, 80);
  const billing_period = body.billing_period === "annual" ? "annual" : body.billing_period === "monthly" ? "monthly" : null;
  const price = num(body.price);
  const setup_fee = body.setup_fee === undefined || body.setup_fee === "" ? 0 : num(body.setup_fee);
  const vat_mode = body.vat_mode === "inclusive" ? "inclusive" : "exclusive";
  const start_date = str(body.start_date, 10);
  const branches_count = Math.trunc(num(body.branches_count ?? 1));
  const features = Array.isArray(body.features) ? Array.from(new Set(body.features.filter((f): f is string => typeof f === "string" && isFeatureKey(f)))) : [];
  const special_terms = str(body.special_terms, 2000) || null;
  const jurisdiction = body.jurisdiction === "business_city" ? "business_city" : "taif";
  const validDays = Math.trunc(num(body.valid_days ?? 14));
  const prefill_phone_raw = str(body.prefill_phone, 20);

  if (plan_name.length < 2) return NextResponse.json({ error: "اكتب اسم الباقة" }, { status: 400 });
  if (!billing_period) return NextResponse.json({ error: "اختر نوع العقد (شهري أو سنوي)" }, { status: 400 });
  if (!Number.isFinite(price) || price < 0 || price > 1_000_000) return NextResponse.json({ error: "السعر غير صحيح" }, { status: 400 });
  if (!Number.isFinite(setup_fee) || setup_fee < 0 || setup_fee > 1_000_000) return NextResponse.json({ error: "رسوم التأسيس غير صحيحة" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date) || Number.isNaN(Date.parse(start_date))) return NextResponse.json({ error: "تاريخ البدء غير صحيح" }, { status: 400 });
  if (!Number.isFinite(branches_count) || branches_count < 1 || branches_count > 500) return NextResponse.json({ error: "عدد الفروع غير صحيح" }, { status: 400 });
  if (features.length === 0) return NextResponse.json({ error: "اختر ميزة وحدة على الأقل" }, { status: 400 });
  if (!Number.isFinite(validDays) || validDays < 1 || validDays > 90) return NextResponse.json({ error: "مدة صلاحية الرابط بين ١ و٩٠ يوم" }, { status: 400 });

  const business_id = Math.trunc(num(body.business_id));
  if (!Number.isFinite(business_id) || business_id < 1) return NextResponse.json({ error: "اختر حساب المشترك اللي العقد مخصص له" }, { status: 400 });
  const { data: biz } = await guard.admin.from("businesses").select("id, name").eq("id", business_id).maybeSingle();
  if (!biz) return NextResponse.json({ error: "حساب المشترك غير موجود" }, { status: 400 });

  const { lines: schedule, error: scheduleError } = validateSchedule(body.payments);
  if (!schedule) return NextResponse.json({ error: scheduleError }, { status: 400 });

  // Discount: `price` is what's charged; list_price is the price before it.
  const listRaw = body.list_price === undefined || body.list_price === null || body.list_price === "" ? null : num(body.list_price);
  if (listRaw !== null && (!Number.isFinite(listRaw) || listRaw < 0 || listRaw > 1_000_000)) return NextResponse.json({ error: "السعر الأساسي غير صحيح" }, { status: 400 });
  if (listRaw !== null && listRaw < price) return NextResponse.json({ error: "السعر بعد الخصم أكبر من السعر الأساسي" }, { status: 400 });
  const list_price = listRaw !== null && listRaw > price ? Math.round(listRaw * 100) / 100 : null;
  const discount_label = list_price !== null ? str(body.discount_label, 60) || null : null;

  const token = randomToken();
  const { data, error } = await guard.admin
    .from("subscription_contracts")
    .insert({
      token,
      plan_name,
      billing_period,
      price: Math.round(price * 100) / 100,
      setup_fee: Math.round(setup_fee * 100) / 100,
      vat_mode,
      start_date,
      branches_count,
      features,
      special_terms,
      jurisdiction,
      expires_at: new Date(Date.now() + validDays * 86_400_000).toISOString(),
      prefill_business_name: str(body.prefill_business_name, 160) || null,
      prefill_owner_name: str(body.prefill_owner_name, 160) || null,
      prefill_phone: prefill_phone_raw ? normalizePhone(prefill_phone_raw) : null,
      business_id,
      list_price,
      discount_label,
      created_by: guard.email,
    })
    .select("id, contract_number, token")
    .single();

  if (error || !data) {
    await logAdminAction(guard.admin, guard.email, "contract.create", null, "failure", { reason: error?.message });
    return NextResponse.json({ error: "تعذر إنشاء العقد" }, { status: 500 });
  }

  const { error: payError } = await guard.admin
    .from("contract_payments")
    .insert(schedule.map((p) => ({ contract_id: data.id, seq: p.seq, amount: p.amount, due_date: p.due_date })));
  if (payError) {
    // A contract without its schedule must never reach the subscriber:
    // void it so the link stops working, and let the admin create it again.
    await guard.admin.from("subscription_contracts").update({ status: "void", voided_at: new Date().toISOString(), voided_by: guard.email }).eq("id", data.id);
    await logAdminAction(guard.admin, guard.email, "contract.create", data.contract_number, "failure", { reason: `payments: ${payError.message}` });
    return NextResponse.json({ error: "تعذر حفظ جدول الدفعات، ما انرسل شي. جرّب مرة ثانية" }, { status: 500 });
  }
  await logAdminAction(guard.admin, guard.email, "contract.create", data.contract_number, "success", { plan_name, billing_period, price, list_price, jurisdiction, business_id, payments: schedule.length });
  return NextResponse.json({ contract: data });
}
