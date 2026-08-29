import { SupabaseClient } from "@supabase/supabase-js";

// Single source of truth for infrastructure usage checks, shared by the
// weekly cron (app/api/cron/usage-check) and the live admin panel view
// (app/api/admin/usage) so the two never drift on limits or math. Exists
// because the account already blew through Supabase's free Cached Egress
// quota once without anyone noticing until the grace-period email arrived.

export const SUPABASE_DB_SIZE_LIMIT_BYTES = 500 * 1024 * 1024; // Supabase free tier: 0.5 GB
export const SUPABASE_STORAGE_LIMIT_BYTES = 1 * 1024 * 1024 * 1024; // Supabase free tier: 1 GB
export const WORKERS_REQUESTS_LIMIT = 10_000_000; // Workers Paid plan included requests/month
export const WORKERS_CPU_MS_LIMIT = 30_000_000; // Workers Paid plan included CPU-ms/month
// R2 free tier, verified against developers.cloudflare.com/r2/pricing/ directly.
export const R2_STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB-month
export const WARN_THRESHOLD = 0.7;

export type UsageMetric = {
  key: string;
  label: string;
  used: number;
  limit: number;
  pct: number;
  unit: "bytes" | "count" | "ms";
};

export async function sumSupabaseStorageBytes(admin: SupabaseClient): Promise<number> {
  const { data: buckets } = await admin.storage.listBuckets();
  let total = 0;
  for (const bucket of buckets || []) {
    const { data: top } = await admin.storage.from(bucket.name).list("", { limit: 1000 });
    for (const item of top || []) {
      if (item.id === null) {
        const { data: sub } = await admin.storage.from(bucket.name).list(item.name, { limit: 1000 });
        for (const f of sub || []) total += f.metadata?.size || 0;
      } else {
        total += item.metadata?.size || 0;
      }
    }
  }
  return total;
}

function pct(used: number, limit: number): number {
  return limit > 0 ? used / limit : 0;
}

async function fetchCloudflareWorkersUsage(token: string, accountId: string): Promise<{ requests: number; cpuMs: number } | null> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const until = new Date().toISOString();
  const query = `query { viewer { accounts(filter: {accountTag: "${accountId}"}) { workersInvocationsAdaptive(limit: 100, filter: { datetime_geq: "${since}", datetime_leq: "${until}" }) { sum { requests cpuTimeUs } } } } }`;
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const json = (await res.json()) as { data?: { viewer?: { accounts?: { workersInvocationsAdaptive?: { sum?: { requests?: number; cpuTimeUs?: number } }[] }[] } } };
  const sums = json.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive;
  if (!sums) return null;
  const requests = sums.reduce((s, r) => s + (r.sum?.requests || 0), 0);
  const cpuMs = sums.reduce((s, r) => s + (r.sum?.cpuTimeUs || 0), 0) / 1000;
  return { requests, cpuMs };
}

async function fetchCloudflareR2Usage(token: string, accountId: string, bucketName: string): Promise<number | null> {
  const today = new Date().toISOString().slice(0, 10);
  const query = `query { viewer { accounts(filter: {accountTag: "${accountId}"}) { r2StorageAdaptiveGroups(limit: 10, filter: { date: "${today}", bucketName: "${bucketName}" }) { max { payloadSize metadataSize } } } } }`;
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const json = (await res.json()) as { data?: { viewer?: { accounts?: { r2StorageAdaptiveGroups?: { max?: { payloadSize?: number; metadataSize?: number } }[] }[] } } };
  const groups = json.data?.viewer?.accounts?.[0]?.r2StorageAdaptiveGroups;
  if (!groups || groups.length === 0) return null;
  return groups.reduce((s, g) => s + (g.max?.payloadSize || 0) + (g.max?.metadataSize || 0), 0);
}

export async function computeUsageReport(admin: SupabaseClient): Promise<{ metrics: UsageMetric[]; warnings: string[] }> {
  const metrics: UsageMetric[] = [];
  const warnings: string[] = [];

  try {
    const { data: dbSizeBytes } = await admin.rpc("get_database_size_bytes");
    if (typeof dbSizeBytes === "number") {
      const p = pct(dbSizeBytes, SUPABASE_DB_SIZE_LIMIT_BYTES);
      metrics.push({ key: "supabase_db", label: "قاعدة بيانات سوبابيس", used: dbSizeBytes, limit: SUPABASE_DB_SIZE_LIMIT_BYTES, pct: p, unit: "bytes" });
      if (p >= WARN_THRESHOLD) warnings.push(`قاعدة البيانات: ${(dbSizeBytes / 1024 / 1024).toFixed(0)}MB من ${SUPABASE_DB_SIZE_LIMIT_BYTES / 1024 / 1024}MB (${(p * 100).toFixed(0)}%)`);
    }
  } catch (err) {
    console.error("usage-report: db size failed", err);
  }

  try {
    const storageBytes = await sumSupabaseStorageBytes(admin);
    const p = pct(storageBytes, SUPABASE_STORAGE_LIMIT_BYTES);
    metrics.push({ key: "supabase_storage", label: "تخزين سوبابيس", used: storageBytes, limit: SUPABASE_STORAGE_LIMIT_BYTES, pct: p, unit: "bytes" });
    if (p >= WARN_THRESHOLD) warnings.push(`تخزين سوبابيس: ${(storageBytes / 1024 / 1024).toFixed(0)}MB من ${SUPABASE_STORAGE_LIMIT_BYTES / 1024 / 1024}MB (${(p * 100).toFixed(0)}%)`);
  } catch (err) {
    console.error("usage-report: supabase storage size failed", err);
  }

  const cfToken = process.env.CLOUDFLARE_API_TOKEN;
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (cfToken && cfAccountId) {
    try {
      const workers = await fetchCloudflareWorkersUsage(cfToken, cfAccountId);
      if (workers) {
        const reqPct = pct(workers.requests, WORKERS_REQUESTS_LIMIT);
        const cpuPct = pct(workers.cpuMs, WORKERS_CPU_MS_LIMIT);
        metrics.push({ key: "workers_requests", label: "طلبات ووركرز (٣٠ يوم)", used: workers.requests, limit: WORKERS_REQUESTS_LIMIT, pct: reqPct, unit: "count" });
        metrics.push({ key: "workers_cpu", label: "وقت معالجة ووركرز (٣٠ يوم)", used: Math.round(workers.cpuMs), limit: WORKERS_CPU_MS_LIMIT, pct: cpuPct, unit: "ms" });
        if (reqPct >= WARN_THRESHOLD) warnings.push(`طلبات الووركرز (٣٠ يوم): ${workers.requests.toLocaleString()} من ${WORKERS_REQUESTS_LIMIT.toLocaleString()} (${(reqPct * 100).toFixed(0)}%)`);
        if (cpuPct >= WARN_THRESHOLD) warnings.push(`وقت المعالجة (٣٠ يوم): ${Math.round(workers.cpuMs).toLocaleString()}ms من ${WORKERS_CPU_MS_LIMIT.toLocaleString()}ms (${(cpuPct * 100).toFixed(0)}%)`);
      }
    } catch (err) {
      console.error("usage-report: cloudflare workers analytics failed", err);
    }

    try {
      const r2Bytes = await fetchCloudflareR2Usage(cfToken, cfAccountId, "rakeen-media");
      if (typeof r2Bytes === "number") {
        const p = pct(r2Bytes, R2_STORAGE_LIMIT_BYTES);
        metrics.push({ key: "r2_storage", label: "تخزين R2 (الصور)", used: r2Bytes, limit: R2_STORAGE_LIMIT_BYTES, pct: p, unit: "bytes" });
        if (p >= WARN_THRESHOLD) warnings.push(`تخزين R2: ${(r2Bytes / 1024 / 1024).toFixed(0)}MB من ${R2_STORAGE_LIMIT_BYTES / 1024 / 1024}MB (${(p * 100).toFixed(0)}%)`);
      }
    } catch (err) {
      console.error("usage-report: cloudflare r2 storage failed", err);
    }
  }

  return { metrics, warnings };
}
