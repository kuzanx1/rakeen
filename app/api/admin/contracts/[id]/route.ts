import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAuth";

// One contract: full record (incl. signature + snapshot) with short-lived
// signed URLs for its files, voiding, and uploading a file (the generated
// signed PDF, or any contract file the admin wants to keep on record).

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
  return NextResponse.json({ contract: data, pdf_url: await sign(data.pdf_path), uploaded_url: await sign(data.uploaded_file_path) });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request, "RL_ADMIN_SENSITIVE");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "غير موجود" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { action?: string };
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
