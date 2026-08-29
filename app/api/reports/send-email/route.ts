import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";

// Sends a report as an HTML email. M4 hardening (security phase 2): this
// used to accept a fully pre-rendered `html` string built client-side and
// mail it verbatim — meaning anyone who could reach this authenticated
// route (any staff account with screen:reports, not just owner/manager)
// could POST arbitrary HTML directly, bypassing the dashboard UI entirely,
// and use Rakeen's own verified sending domain as a phishing template
// engine. The server now renders the ENTIRE email itself from a small set
// of validated, length-capped, HTML-escaped fields — the client can no
// longer send a tag or attribute, only text values for a fixed layout.
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface ReportStat {
  label: string;
  value: string;
  total?: boolean;
}
interface ReportTable {
  headers: string[];
  rows: (string | number)[][];
}
interface ReportPayload {
  businessName: string;
  generatedAt: string;
  reportTitle: string;
  stats?: ReportStat[];
  table?: ReportTable;
}

const MAX_STR = 200;
const MAX_ROWS = 300;
const MAX_COLS = 12;

function isValidPayload(p: unknown): p is ReportPayload {
  if (!p || typeof p !== "object") return false;
  const r = p as Record<string, unknown>;
  if (typeof r.businessName !== "string" || r.businessName.length > MAX_STR) return false;
  if (typeof r.generatedAt !== "string" || r.generatedAt.length > MAX_STR) return false;
  if (typeof r.reportTitle !== "string" || r.reportTitle.length > MAX_STR) return false;
  if (r.stats !== undefined) {
    if (!Array.isArray(r.stats) || r.stats.length > 30) return false;
    for (const s of r.stats) {
      if (!s || typeof s !== "object") return false;
      const st = s as Record<string, unknown>;
      if (typeof st.label !== "string" || st.label.length > MAX_STR) return false;
      if (typeof st.value !== "string" || st.value.length > MAX_STR) return false;
    }
  }
  if (r.table !== undefined) {
    if (!r.table || typeof r.table !== "object") return false;
    const t = r.table as Record<string, unknown>;
    if (!Array.isArray(t.headers) || t.headers.length > MAX_COLS) return false;
    if (!t.headers.every((h) => typeof h === "string" && h.length <= MAX_STR)) return false;
    if (!Array.isArray(t.rows) || t.rows.length > MAX_ROWS) return false;
    for (const row of t.rows) {
      if (!Array.isArray(row) || row.length > MAX_COLS) return false;
      if (!row.every((c) => (typeof c === "string" || typeof c === "number") && String(c).length <= MAX_STR)) return false;
    }
  }
  return true;
}

function renderReportEmailHtml(payload: ReportPayload): string {
  const statsHtml = (payload.stats || [])
    .map(
      (s) =>
        `<tr><td style="padding:8px 0; ${s.total ? "font-weight:800; border-top:2px solid #171717;" : ""}">${escapeHtml(s.label)}</td><td style="padding:8px 0; text-align:left; ${s.total ? "font-weight:800; border-top:2px solid #171717;" : ""}">${escapeHtml(s.value)}</td></tr>`
    )
    .join("");
  const tableHtml = payload.table
    ? `<table style="width:100%; border-collapse:collapse; margin-top:18px; font-size:13px;">
      <thead><tr>${payload.table.headers.map((h) => `<th style="text-align:right; border-bottom:2px solid #171717; padding:8px 4px; font-size:11.5px;">${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>${
        payload.table.rows.length
          ? payload.table.rows.map((r) => `<tr>${r.map((c, i) => `<td style="padding:7px 4px; border-bottom:1px solid #eee;${i > 0 ? " text-align:left;" : ""}">${escapeHtml(c)}</td>`).join("")}</tr>`).join("")
          : `<tr><td colspan="${payload.table.headers.length}" style="text-align:center; color:#999; padding:14px;">لا توجد بيانات</td></tr>`
      }</tbody>
    </table>`
    : "";
  return `
  <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; max-width:600px; margin:0 auto; color:#171717; padding:24px 18px;">
    <div style="border-bottom:3px solid #C4FF2B; padding-bottom:14px; margin-bottom:18px;">
      <div style="font-weight:800; font-size:19px;">${escapeHtml(payload.businessName)}</div>
      <div style="font-size:11px; color:#8a8477; margin-top:3px;">${escapeHtml(payload.generatedAt)}</div>
    </div>
    <div style="font-weight:800; font-size:16px; margin-bottom:14px;">${escapeHtml(payload.reportTitle)}</div>
    ${statsHtml ? `<table style="width:100%; border-collapse:collapse; font-size:13.5px;">${statsHtml}</table>` : ""}
    ${tableHtml}
    <div style="margin-top:28px; font-size:10px; color:#c9c4ba; text-align:center;">تقرير مُصدر من نظام ركين لإدارة المطاعم</div>
  </div>`;
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const asCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user: caller }, error: callerError } = await asCaller.auth.getUser(token);
  if (callerError || !caller) return NextResponse.json({ error: "جلسة غير صالحة" }, { status: 401 });

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: profile } = await admin.from("profiles").select("id, business_id, user_type").eq("id", caller.id).single();
  if (!profile) return NextResponse.json({ error: "الحساب غير موجود" }, { status: 403 });

  if (!["owner", "manager"].includes(profile.user_type)) {
    const { data: perm } = await admin
      .from("user_permissions").select("permission_key").eq("user_id", profile.id).eq("permission_key", "screen:reports").maybeSingle();
    if (!perm) return NextResponse.json({ error: "ما عندك صلاحية على شاشة التقارير" }, { status: 403 });
  }

  if (!(await checkRateLimit(request, "RL_EMAIL", String(profile.business_id)))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }
  if (!(await checkDbRateLimit(admin, request, "RL_EMAIL", 5, 60, String(profile.business_id)))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const { to, payload } = await request.json();
  if (!to || typeof to !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: "بريد إلكتروني غير صالح" }, { status: 400 });
  }
  if (!isValidPayload(payload)) {
    return NextResponse.json({ error: "بيانات التقرير غير صالحة" }, { status: 400 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const EMAIL = (env as unknown as { EMAIL?: { send: (msg: Record<string, unknown>) => Promise<unknown> } }).EMAIL;
  if (!EMAIL) {
    return NextResponse.json({ error: "خدمة الإيميل مو متاحة على هذا الإصدار" }, { status: 503 });
  }

  const html = renderReportEmailHtml(payload);
  const subject = `${payload.reportTitle} — ${payload.businessName}`.slice(0, 200);
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || "reports@your-domain-here.com";
  try {
    await EMAIL.send({
      to,
      from: { email: fromAddress, name: "ركين" },
      subject,
      html,
      text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "تعذر الإرسال — خدمة الإيميل ما زالت غير مفعّلة (تحتاج ربط دومين بحساب Cloudflare أول)" },
      { status: 502 }
    );
  }
}
