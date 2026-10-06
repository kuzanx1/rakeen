import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAuth";
import { validateSchedule } from "@/lib/contracts";

// One contract: full record (incl. signature + snapshot) with short-lived
// signed URLs for its files, voiding, uploading a file (the generated
// signed PDF, or any contract file the admin wants to keep on record), and
// its payments (confirm, reject a receipt, add a payment).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_UPLOAD = 15 * 1024 * 1024;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request);
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "غير موجود" }, { status: 404 });

  const { data, error } = await guard.admin.from("subscription_contracts").select("*").eq("id", id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "غير موجود" }, { status: 404 });

  const sign = async (path: string | null) => {
    if (!path) return null;
    const { data: s } = await guard.admin.storage.from("contracts").createSignedUrl(path, 600);
    return s?.signedUrl || null;
  };
  const [{ data: pays }, { data: biz }] = await Promise.all([
    guard.admin
      .from("contract_payments")
      .select("id, seq, amount, due_date, status, receipt_path, submitted_at, reviewed_at, reviewed_by, review_note")
      .eq("contract_id", id)
      .order("seq"),
    data.business_id ? guard.admin.from("businesses").select("id, name").eq("id", data.business_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const payments = await Promise.all(
    (pays || []).map(async (p) => ({ ...p, amount: Number(p.amount), receipt_url: await sign(p.receipt_path) }))
  );
  return NextResponse.json({
    contract: { ...data, account_name: biz?.name || null },
    payments,
    pdf_url: await sign(data.pdf_path),
    uploaded_url: await sign(data.uploaded_file_path),
  });
}

// Payment actions on one contract. Every payment is confirmed by hand: the
// subscriber's receipt alone never marks anything paid.
async function paymentAction(
  admin: SupabaseClient,
  email: string,
  contractId: string,
  body: { action?: string; payment_id?: string; note?: string; amount?: unknown; due_date?: unknown }
): Promise<NextResponse> {
  const { data: contract } = await admin.from("subscription_contracts").select("contract_number, status").eq("id", contractId).maybeSingle();
  if (!contract) return NextResponse.json({ error: "غير موجود" }, { status: 404 });

  if (body.action === "pay_add") {
    if (contract.status === "void") return NextResponse.json({ error: "العقد ملغي" }, { status: 400 });
    const { data: last } = await admin.from("contract_payments").select("seq, due_date").eq("contract_id", contractId).order("seq", { ascending: false }).limit(1).maybeSingle();
    const { lines, error } = validateSchedule([{ amount: body.amount, due_date: body.due_date }]);
    if (!lines) return NextResponse.json({ error }, { status: 400 });
    if (last && lines[0].due_date < last.due_date) return NextResponse.json({ error: "تاريخ الدفعة الجديدة قبل آخر دفعة" }, { status: 400 });
    const seq = (last?.seq || 0) + 1;
    const { error: insErr } = await admin.from("contract_payments").insert({ contract_id: contractId, seq, amount: lines[0].amount, due_date: lines[0].due_date });
    if (insErr) return NextResponse.json({ error: "تعذر إضافة الدفعة" }, { status: 500 });
    await logAdminAction(admin, email, "contract.payment_add", contract.contract_number, "success", { seq, amount: lines[0].amount, due_date: lines[0].due_date });
    return NextResponse.json({ ok: true });
  }

  const paymentId = typeof body.payment_id === "string" && UUID.test(body.payment_id) ? body.payment_id : null;
  if (!paymentId) return NextResponse.json({ error: "الدفعة غير موجودة" }, { status: 404 });

  if (body.action === "pay_approve") {
    const { data, error } = await admin
      .from("contract_payments")
      .update({ status: "paid", reviewed_at: new Date().toISOString(), reviewed_by: email, review_note: null })
      .eq("id", paymentId)
      .eq("contract_id", contractId)
      .neq("status", "paid")
      .select("seq")
      .maybeSingle();
    if (error || !data) return NextResponse.json({ error: "تعذر تأكيد الدفعة (يمكن انأكدت قبل)" }, { status: 400 });
    await logAdminAction(admin, email, "contract.payment_approve", contract.contract_number, "success", { seq: data.seq });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "pay_reject") {
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
    if (note.length < 2) return NextResponse.json({ error: "اكتب سبب الرفض عشان يوصل للمشترك" }, { status: 400 });
    const { data, error } = await admin
      .from("contract_payments")
      .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: email, review_note: note })
      .eq("id", paymentId)
      .eq("contract_id", contractId)
      .eq("status", "submitted")
      .select("seq")
      .maybeSingle();
    if (error || !data) return NextResponse.json({ error: "تعذر رفض الإيصال" }, { status: 400 });
    await logAdminAction(admin, email, "contract.payment_reject", contract.contract_number, "success", { seq: data.seq, note });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request, "RL_ADMIN_SENSITIVE");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "غير موجود" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { action?: string; payment_id?: string; note?: string; amount?: unknown; due_date?: unknown };
  if (body.action === "pay_approve" || body.action === "pay_reject" || body.action === "pay_add") {
    return paymentAction(guard.admin, guard.email, id, body);
  }
  if (body.action !== "void") return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });

  const { data, error } = await guard.admin
    .from("subscription_contracts")
    .update({ status: "void", voided_at: new Date().toISOString(), voided_by: guard.email })
    .eq("id", id)
    .neq("status", "void")
    .select("contract_number")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "تعذر إلغاء العقد" }, { status: 400 });
  await logAdminAction(guard.admin, guard.email, "contract.void", data.contract_number, "success");
  return NextResponse.json({ ok: true });
}

// multipart/form-data: file=<pdf|png|jpg>, kind=pdf (the signed PDF) | file (any attachment)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request, "RL_UPLOAD");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "غير موجود" }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const kind = form?.get("kind") === "pdf" ? "pdf" : "file";
  if (!file || typeof file === "string") return NextResponse.json({ error: "ارفق ملف" }, { status: 400 });
  if (file.size > MAX_UPLOAD) return NextResponse.json({ error: "حجم الملف أكبر من ١٥ ميجا" }, { status: 400 });
  const type = file.type;
  if (!["application/pdf", "image/png", "image/jpeg"].includes(type)) return NextResponse.json({ error: "الملف لازم PDF أو صورة" }, { status: 400 });
  if (kind === "pdf" && type !== "application/pdf") return NextResponse.json({ error: "ملف العقد الموقّع لازم PDF" }, { status: 400 });

  const { data: row } = await guard.admin.from("subscription_contracts").select("contract_number, status").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  if (kind === "pdf" && row.status !== "signed") return NextResponse.json({ error: "العقد ما انوقّع بعد" }, { status: 400 });

  const ext = type === "application/pdf" ? "pdf" : type === "image/png" ? "png" : "jpg";
  const path = `${id}/${kind === "pdf" ? "signed" : "upload"}-${row.contract_number}-${Date.now()}.${ext}`;
  const { error: upErr } = await guard.admin.storage.from("contracts").upload(path, await file.arrayBuffer(), { contentType: type, upsert: false });
  if (upErr) return NextResponse.json({ error: "تعذر رفع الملف" }, { status: 500 });

  await guard.admin
    .from("subscription_contracts")
    .update(kind === "pdf" ? { pdf_path: path } : { uploaded_file_path: path })
    .eq("id", id);
  await logAdminAction(guard.admin, guard.email, kind === "pdf" ? "contract.pdf_upload" : "contract.file_upload", row.contract_number, "success");
  return NextResponse.json({ ok: true });
}
