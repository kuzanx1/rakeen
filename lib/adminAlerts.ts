import type { SupabaseClient } from "@supabase/supabase-js";
import { computeUsageReport } from "@/lib/usage";
import { formatSar } from "@/lib/contracts";

// جمع تنبيهات جوال الإدارة. الإرسال وعدم التكرار في app/api/cron/admin-alerts.

const SOON_DAYS = 5;
const TRIAL_WARN = 0.8;
const USAGE_STEPS = [1, 0.9, 0.7];

export type Alert = { key: string; group: "expiry" | "payment" | "trial" | "usage" | "signup"; title: string; line: string };

const DEVICE_AR: Record<string, string> = { ios: "آيفون/آيباد", android: "أندرويد", sunmi: "سنمي", windows: "ويندوز" };

export function riyadhToday(): string {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
}
function inDays(n: number): string {
  return n === 0 ? "اليوم" : n === 1 ? "بكرة" : n === 2 ? "بعد يومين" : `بعد ${n} أيام`;
}

export async function collectAdminAlerts(admin: SupabaseClient, today: string): Promise<Alert[]> {
  const alerts: Alert[] = [];

  const { data: bizRows } = await admin
    .from("businesses")
    .select("id, name, is_active, online_subscribed, online_order_free_count, online_order_free_limit, subscription_expires_at");
  const names = new Map<number, string>();
  for (const b of bizRows || []) {
    const id = Number(b.id);
    names.set(id, b.name as string);
    if (!b.is_active) continue;

    const exp = (b.subscription_expires_at as string | null)?.slice(0, 10);
    if (exp) {
      const left = daysBetween(today, exp);
      if (left < 0) {
        alerts.push({ key: `exp-over:${id}:${exp}`, group: "expiry", title: "انتهى اشتراك", line: `${b.name}: خلص اشتراكه ${exp}، لازم يجدّد` });
      } else if (left <= SOON_DAYS) {
        alerts.push({ key: `exp-soon:${id}:${exp}`, group: "expiry", title: "اشتراك قرّب يخلص", line: `${b.name}: يخلص اشتراكه ${inDays(left)} (${exp})` });
      }
    }

    const limit = Number(b.online_order_free_limit) || 0;
    const used = Number(b.online_order_free_count) || 0;
    if (!b.online_subscribed && limit > 0) {
      if (used >= limit) {
        alerts.push({ key: `trial-done:${id}:${limit}`, group: "trial", title: "خلّص التجربة", line: `${b.name}: استخدم كل الطلبات المجانية (${used}/${limit})، جاهز للاشتراك` });
      } else if (used / limit >= TRIAL_WARN) {
        alerts.push({ key: `trial-80:${id}:${limit}`, group: "trial", title: "قرّب يخلّص التجربة", line: `${b.name}: استخدم ${used} من ${limit} طلب مجاني` });
      }
    }
  }

  const { data: contracts } = await admin.from("subscription_contracts").select("id, business_id, business_name, status").eq("status", "signed");
  const contractById = new Map((contracts || []).map((c) => [c.id as string, c]));
  if (contractById.size > 0) {
    const horizon = new Date(Date.parse(today + "T00:00:00Z") + SOON_DAYS * 86400000).toISOString().slice(0, 10);
    const { data: pays } = await admin
      .from("contract_payments")
      .select("id, contract_id, seq, amount, due_date, status")
      .in("status", ["due", "rejected"])
      .lte("due_date", horizon);
    for (const p of pays || []) {
      const c = contractById.get(p.contract_id as string);
      if (!c) continue;
      const who = (c.business_id && names.get(Number(c.business_id))) || (c.business_name as string) || "عميل";
      const amount = formatSar(Number(p.amount) || 0);
      const due = String(p.due_date).slice(0, 10);
      const left = daysBetween(today, due);
      if (left < 0) {
        // كم يوماً تأخّر، لا «كانت مستحقة» وحدَها: طلبُ المالك أن يعرف
        // الشدّةَ من سطرِ التنبيه نفسِه قبل أن يفتح شيئاً.
        alerts.push({ key: `pay-over:${p.id}:${due}`, group: "payment", title: "دفعة متأخرة", line: `${who}: متأخّر ${-left} يوم — الدفعة ${p.seq} (${amount}) كانت مستحقة ${due}` });
      } else {
        alerts.push({ key: `pay-soon:${p.id}:${due}`, group: "payment", title: "دفعة قرّبت", line: `${who}: الدفعة ${p.seq} (${amount}) مستحقة ${inDays(left)}` });
      }
    }
  }

  try {
    const { metrics } = await computeUsageReport(admin);
    const month = today.slice(0, 7);
    for (const m of metrics) {
      const step = USAGE_STEPS.find((s) => m.pct >= s);
      if (!step) continue;
      alerts.push({
        key: `usage:${m.key}:${Math.round(step * 100)}:${month}`,
        group: "usage",
        title: step >= 1 ? "تعدّى حد الاستهلاك" : "الاستهلاك ارتفع",
        line: `${m.label}: ${Math.round(m.pct * 100)}٪ من الحد`,
      });
    }
  } catch (err) {
    console.error("admin-alerts: usage report failed", err);
  }

  // تسجيلٌ ذاتيٌّ جديد من /signup. واحدٌ لكلِّ طلبٍ لم يُقرأ بعد، ومفتاحُه
  // ثابتٌ برقم الصفِّ فلا يتكرّر الإرسالُ كلَّ ساعة. والجدولُ قد لا يكون
  // موجوداً قبل تشغيل الهجرة، فيسقط بصمت ولا يُعطّل بقيّةَ التنبيهات.
  try {
    const { data: signups } = await admin
      .from("signup_requests")
      .select("id, owner_name, brand_name, phone, business_type, devices, menu_help, cr_number")
      .is("seen_at", null)
      .order("created_at", { ascending: false })
      .limit(20);
    for (const r of signups || []) {
      const devs = Array.isArray(r.devices) ? (r.devices as string[]).map((d) => DEVICE_AR[d] || d).join("، ") : "";
      const bits = [
        `${r.owner_name} — ${r.phone || "بلا جوال"}`,
        devs ? `أجهزته: ${devs}` : "",
        r.menu_help === "rakeen" ? "يبي فريق ركين يدخّل له القائمة" : r.menu_help === "self" ? "بيدخّل قائمته بنفسه" : "",
        r.cr_number ? `سجل تجاري: ${r.cr_number}` : "بلا سجل تجاري",
      ].filter(Boolean);
      alerts.push({
        key: `signup:${r.id}`,
        group: "signup",
        title: "تسجيل جديد",
        line: `${r.brand_name} — ${bits.join(" · ")}`,
      });
    }
  } catch (err) {
    console.error("admin-alerts: signup requests failed", err);
  }

  return alerts;
}

export const GROUP_TITLE: Record<Alert["group"], string> = {
  signup: "تسجيلات جديدة",
  expiry: "اشتراكات المطاعم",
  payment: "دفعات العقود",
  trial: "استهلاك التجربة",
  usage: "استهلاك البنية التحتية",
};
