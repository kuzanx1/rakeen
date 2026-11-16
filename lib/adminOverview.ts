import type { SupabaseClient } from "@supabase/supabase-js";

// «نظرة عامة» في /admin: نشاط كل مشترك (طلبات ومبيعات اليوم/الأسبوع/الشهر،
// آخر طلب، حالته)، وأرقام المنصة كاملة، والمدفوعات. كل الحساب هنا من جداول
// موجودة (orders، subscription_contracts، contract_payments)، بدون migration.
// الطلبات آخر ٩٠ يوم تنقرأ صفحات (١٠٠٠ صف)، وهذا يكفي لحجمنا الحالي؛ لو كبرت
// الأرقام نحوّل التجميع لدالة SQL.

const DAY = 864e5;
const RIYADH = 3 * 3600e3; // UTC+3 بدون توقيت صيفي
const WINDOW_DAYS = 90;
const MAX_PAGES = 60;

const dayKey = (ms: number) => new Date(ms + RIYADH).toISOString().slice(0, 10);

type OrderRow = { business_id: number; total: number | string; refunded_amount: number | string | null; status: string; source: string | null; created_at: string };

export async function buildOverview(admin: SupabaseClient) {

  const now = Date.now();
  const todayKey = dayKey(now);
  // بداية اليوم بتوقيت الرياض
  const todayStart = Date.parse(todayKey + "T00:00:00+03:00");
  const since = new Date(todayStart - (WINDOW_DAYS - 1) * DAY).toISOString();

  // ── المشتركين
  let bizRes: { data: Record<string, unknown>[] | null; error: unknown } = await admin
    .from("businesses")
    .select("id, name, is_active, online_subscribed, online_order_free_count, online_order_free_limit, subscription_expires_at, created_at, business_type, verification_status, plan_tier")
    .order("created_at", { ascending: false });
  if (bizRes.error) {
    // plan_tier غير موجود لو migration الباقات ما انشغلت
    bizRes = await admin
      .from("businesses")
      .select("id, name, is_active, online_subscribed, online_order_free_count, online_order_free_limit, subscription_expires_at, created_at, business_type, verification_status")
      .order("created_at", { ascending: false });
  }
  if (bizRes.error) return { error: "تعذر تحميل المشتركين" };
  const businesses = (bizRes.data || []) as Record<string, unknown>[];

  // ── أصحاب المنشآت (الاسم من profiles، الجوال والإيميل من حساب الدخول)
  const { data: owners } = await admin.from("profiles").select("id, business_id, full_name").eq("user_type", "owner");
  const contactById: Record<string, { phone: string | null; email: string | null }> = {};
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    data.users.forEach((u) => {
      const meta = (u.user_metadata || {}) as Record<string, unknown>;
      contactById[u.id] = { phone: (typeof meta.phone === "string" && meta.phone) || u.phone || null, email: u.email || null };
    });
    if (data.users.length < 1000) break;
  }
  const ownerByBiz: Record<number, { name: string | null; phone: string | null; email: string | null }> = {};
  (owners || []).forEach((o) => {
    const c = contactById[o.id] || { phone: null, email: null };
    ownerByBiz[Number(o.business_id)] = { name: o.full_name || null, ...c };
  });

  // ── عدد الطلبات من البداية
  const { data: lifetime } = await admin.rpc("admin_business_order_counts");
  const lifetimeByBiz: Record<number, number> = {};
  ((lifetime as { business_id: number; total_orders: number }[] | null) || []).forEach((r) => {
    lifetimeByBiz[Number(r.business_id)] = Number(r.total_orders) || 0;
  });

  // ── الطلبات آخر ٩٠ يوم
  const orders: OrderRow[] = [];
  let truncated = false;
  for (let p = 0; p < MAX_PAGES; p++) {
    const { data, error } = await admin
      .from("orders")
      .select("business_id, total, refunded_amount, status, source, created_at")
      .gte("created_at", since)
      .order("id", { ascending: true })
      .range(p * 1000, p * 1000 + 999);
    if (error) return { error: "تعذر تحميل الطلبات" };
    orders.push(...((data || []) as OrderRow[]));
    if (!data || data.length < 1000) break;
    if (p === MAX_PAGES - 1) truncated = true;
  }

  // ── العقود والدفعات
  const { data: contracts } = await admin
    .from("subscription_contracts")
    .select("id, business_id, status, plan_name, billing_period, price, signed_at, created_at");
  const liveContracts = (contracts || []).filter((c) => c.status !== "void");
  const contractById: Record<string, (typeof liveContracts)[number]> = {};
  liveContracts.forEach((c) => (contractById[c.id] = c));
  const { data: payments } = await admin.from("contract_payments").select("contract_id, amount, due_date, status, reviewed_at, submitted_at");
  const livePayments = (payments || []).filter((p) => contractById[p.contract_id]);

  // ── التجميع
  type Agg = {
    today: [number, number];
    yesterday: [number, number];
    d7: [number, number];
    d30: [number, number];
    online30: number;
    days: Set<string>;
    last: number;
    series: Record<string, number>;
  };
  const blank = (): Agg => ({ today: [0, 0], yesterday: [0, 0], d7: [0, 0], d30: [0, 0], online30: 0, days: new Set(), last: 0, series: {} });
  const agg: Record<number, Agg> = {};
  const platDay: Record<string, [number, number]> = {};
  const yKey = dayKey(now - DAY);
  const t7 = todayStart - 6 * DAY;
  const t30 = todayStart - 29 * DAY;
  const p7 = todayStart - 13 * DAY;
  const p30 = todayStart - 59 * DAY;
  const plat = { today: [0, 0], yesterday: [0, 0], d7: [0, 0], prev7: [0, 0], d30: [0, 0], prev30: [0, 0] } as Record<string, [number, number]>;

  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const t = Date.parse(o.created_at);
    const k = dayKey(t);
    const net = o.status === "refunded" ? 0 : Math.max(0, Number(o.total) - Number(o.refunded_amount || 0));
    const a = (agg[o.business_id] ||= blank());
    if (t > a.last) a.last = t;
    const add = (x: [number, number]) => {
      x[0] += 1;
      x[1] += net;
    };
    if (k === todayKey) {
      add(a.today);
      add(plat.today);
    }
    if (k === yKey) {
      add(a.yesterday);
      add(plat.yesterday);
    }
    if (t >= t7) {
      add(a.d7);
      add(plat.d7);
    } else if (t >= p7) add(plat.prev7);
    if (t >= t30) {
      add(a.d30);
      add(plat.d30);
      a.days.add(k);
      if (o.source === "online") a.online30 += 1;
    } else if (t >= p30) add(plat.prev30);
    if (t >= todayStart - 13 * DAY) a.series[k] = (a.series[k] || 0) + 1;
    const pd = (platDay[k] ||= [0, 0]);
    pd[0] += 1;
    pd[1] += net;
  }

  const keys = (n: number) => Array.from({ length: n }, (_, i) => dayKey(todayStart - (n - 1 - i) * DAY + 12 * 3600e3));
  const keys14 = keys(14);
  const keys30 = keys(30);
  const round = (n: number) => Math.round(n * 100) / 100;

  // دفعات كل منشأة
  const payByBiz: Record<number, { overdue: number; overdueCount: number; nextDue: string | null; nextAmount: number; pending: number; paid: number }> = {};
  const todayDate = todayKey;
  const in14 = dayKey(now + 14 * DAY);
  const monthStart = todayKey.slice(0, 7);
  const money = { paidThisMonth: 0, paidTotal: 0, overdue: 0, overdueCount: 0, due14: 0, due14Count: 0, pendingReview: 0 };
  for (const p of livePayments) {
    const c = contractById[p.contract_id];
    const bid = Number(c.business_id);
    const amt = Number(p.amount) || 0;
    const row = (payByBiz[bid] ||= { overdue: 0, overdueCount: 0, nextDue: null, nextAmount: 0, pending: 0, paid: 0 });
    if (p.status === "paid") {
      money.paidTotal += amt;
      row.paid += amt;
      const when = (p.reviewed_at || p.due_date || "").slice(0, 7);
      if (when === monthStart) money.paidThisMonth += amt;
      continue;
    }
    if (p.status === "submitted") {
      money.pendingReview += 1;
      row.pending += 1;
    }
    if (p.due_date < todayDate && p.status !== "submitted") {
      money.overdue += amt;
      money.overdueCount += 1;
      row.overdue += amt;
      row.overdueCount += 1;
    } else if (p.due_date >= todayDate) {
      if (p.due_date <= in14) {
        money.due14 += amt;
        money.due14Count += 1;
      }
      if (!row.nextDue || p.due_date < row.nextDue) {
        row.nextDue = p.due_date;
        row.nextAmount = amt;
      }
    }
  }
  // الدخل الشهري المتكرر من العقود الموقّعة
  let mrr = 0;
  const contractByBiz: Record<number, { status: string; plan: string | null; price: number; period: string }> = {};
  liveContracts.forEach((c) => {
    const bid = Number(c.business_id);
    const price = Number(c.price) || 0;
    if (c.status === "signed") mrr += c.billing_period === "annual" ? price / 12 : price;
    const cur = contractByBiz[bid];
    if (!cur || c.status === "signed") contractByBiz[bid] = { status: c.status, plan: c.plan_name || null, price, period: c.billing_period };
  });

  const rows = businesses.map((b) => {
    const id = Number(b.id);
    const a = agg[id] || blank();
    const total = lifetimeByBiz[id] ?? 0;
    const lastMs = a.last || 0;
    const sinceLast = lastMs ? (now - lastMs) / DAY : Infinity;
    const status = !b.is_active ? "suspended" : total === 0 && !lastMs ? "new" : sinceLast <= 2 ? "active" : sinceLast <= 7 ? "slowing" : "idle";
    const limit = Number(b.online_order_free_limit) || 0;
    const used = Number(b.online_order_free_count) || 0;
    return {
      id,
      name: String(b.name || ""),
      type: String(b.business_type || ""),
      createdAt: String(b.created_at || ""),
      plan: (b.plan_tier as string | null) ?? null,
      subscribed: !!b.online_subscribed,
      verification: String(b.verification_status || ""),
      expiresAt: (b.subscription_expires_at as string | null) || null,
      trial: !b.online_subscribed ? { used, limit } : null,
      owner: ownerByBiz[id] || { name: null, phone: null, email: null },
      status,
      lastOrderAt: lastMs ? new Date(lastMs).toISOString() : null,
      lifetimeOrders: total,
      today: { orders: a.today[0], sales: round(a.today[1]) },
      yesterday: { orders: a.yesterday[0], sales: round(a.yesterday[1]) },
      d7: { orders: a.d7[0], sales: round(a.d7[1]) },
      d30: { orders: a.d30[0], sales: round(a.d30[1]) },
      online30: a.online30,
      activeDays30: a.days.size,
      series: keys14.map((k) => a.series[k] || 0),
      contract: contractByBiz[id] || null,
      payments: payByBiz[id] || null,
    };
  });

  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const pair = (x: [number, number]) => ({ orders: x[0], sales: round(x[1]) });

  return {
    generatedAt: new Date(now).toISOString(),
    today: todayKey,
    truncated,
    platform: {
      today: pair(plat.today),
      yesterday: pair(plat.yesterday),
      d7: pair(plat.d7),
      prev7: pair(plat.prev7),
      d30: pair(plat.d30),
      prev30: pair(plat.prev30),
      series: keys30.map((k) => ({ day: k, orders: platDay[k]?.[0] || 0, sales: round(platDay[k]?.[1] || 0) })),
      counts: {
        total: rows.length,
        active: count("active"),
        slowing: count("slowing"),
        idle: count("idle"),
        new: count("new"),
        suspended: count("suspended"),
        subscribed: rows.filter((r) => r.subscribed).length,
        trial: rows.filter((r) => !r.subscribed).length,
        orderedToday: rows.filter((r) => r.today.orders > 0).length,
      },
      plans: {
        asas: rows.filter((r) => r.plan === "asas").length,
        emad: rows.filter((r) => r.plan === "emad").length,
        sarh: rows.filter((r) => r.plan === "sarh").length,
        none: rows.filter((r) => !r.plan).length,
      },
    },
    money: { ...Object.fromEntries(Object.entries(money).map(([k, v]) => [k, round(v)])), mrr: round(mrr) },
    businesses: rows,
  };
}
