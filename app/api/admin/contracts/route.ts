import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAuth";
import { isFeatureKey, normalizePhone } from "@/lib/contracts";

// Platform-admin contracts: list + create. Creating a contract mints a
// one-off signing link (/contract/<token>) to send to the subscriber.

const LIST_COLUMNS =
  "id, contract_number, token, status, plan_name, billing_period, price, setup_fee, vat_mode, start_date, branches_count, features, expires_at, prefill_business_name, prefill_owner_name, prefill_phone, business_name, owner_name, phone, email, signed_at, pdf_path, uploaded_file_path, created_at, voided_at";

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ("response" in guard) return guard.response;
  const { data, error } = await guard.admin
    .from("subscription_contracts")
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: "تعذر تحميل العقود" }, { status: 500 });
  return NextResponse.json({ contracts: data });
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
      expires_at: new Date(Date.now() + validDays * 86_400_000).toISOString(),
      prefill_business_name: str(body.prefill_business_name, 160) || null,
      prefill_owner_name: str(body.prefill_owner_name, 160) || null,
      prefill_phone: prefill_phone_raw ? normalizePhone(prefill_phone_raw) : null,
      created_by: guard.email,
    })
    .select("id, contract_number, token")
    .single();

  if (error || !data) {
    await logAdminAction(guard.admin, guard.email, "contract.create", null, "failure", { reason: error?.message });
    return NextResponse.json({ error: "تعذر إنشاء العقد" }, { status: 500 });
  }
  await logAdminAction(guard.admin, guard.email, "contract.create", data.contract_number, "success", { plan_name, billing_period, price });
  return NextResponse.json({ contract: data });
}
