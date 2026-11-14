import type { SupabaseClient } from "@supabase/supabase-js";

// Which businesses' logos run in the «مطاعم وكافيهات تشتغل على ركين» strip
// on rakeenapp.com, and in what order. Edited from /admin («عملاء الهبوط»),
// stored in platform_settings under "landing_clients" (service role only).
// The logos themselves are read live from businesses.logo_url, so a new
// logo shows on the landing without anyone touching it.

const KEY = "landing_clients";

// What the strip showed before this setting existed, so the day it ships
// nothing changes on the site until the admin saves a new list.
const DEFAULT_SHOWN = [83, 1, 114, 115, 116, 117, 118];

export type LandingClient = { id: number; name: string; logo: string };

export function cleanIds(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const x of v) {
    const n = Number(x);
    if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  return out.slice(0, 60);
}

export async function getShownIds(admin: SupabaseClient): Promise<number[]> {
  const { data } = await admin.from("platform_settings").select("value").eq("key", KEY).maybeSingle();
  if (!data) return DEFAULT_SHOWN;
  return cleanIds((data.value as { shown?: unknown })?.shown);
}

export async function setShownIds(admin: SupabaseClient, ids: number[], email: string) {
  return admin
    .from("platform_settings")
    .upsert({ key: KEY, value: { shown: ids }, updated_at: new Date().toISOString(), updated_by: email });
}

// The strip itself: shown businesses that still exist and still have a logo,
// in the admin's order.
export async function getLandingClients(admin: SupabaseClient): Promise<LandingClient[]> {
  const ids = await getShownIds(admin);
  if (!ids.length) return [];
  const { data } = await admin.from("businesses").select("id, name, logo_url").in("id", ids);
  const byId = new Map((data || []).map((b) => [b.id as number, b]));
  return ids
    .map((id) => byId.get(id))
    .filter((b): b is { id: number; name: string; logo_url: string } => !!b && typeof b.logo_url === "string" && /^https:\/\//.test(b.logo_url))
    .map((b) => ({ id: b.id, name: b.name || "", logo: b.logo_url }));
}
