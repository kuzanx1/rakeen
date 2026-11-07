import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Metadata, Viewport } from "next";
import { keyToUuid } from "@/lib/pager";
import PagerClient, { type PagerStatus } from "./PagerClient";
import "./pager.css";

/**
 * بيجر ركين -- صفحةُ الزبون. يفتحها من باركود الفاتورة أو شاشة العميل.
 *
 * بلا تطبيق ولا تسجيل: رقمُ طلبه كبيراً بهوية المحل، ومرحلتُه، والوقتُ
 * المتوقّع. ولما يضغط الكاشيرُ «جاهز» يرن الجوال ويهتزّ وتشتعل الشاشة.
 */
// cache: البيانات الوصفية ولون الشريط والصفحة تسأل مرّةً واحدة لا ثلاثاً.
const load = cache(async (uuid: string): Promise<PagerStatus | null> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  try {
    const sb = createClient(url, anon, { auth: { persistSession: false } });
    const { data, error } = await sb.rpc("get_pager_status", { p_key: uuid });
    if (error || !data) return null;
    return data as PagerStatus;
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const uuid = keyToUuid(key);
  const s = uuid ? await load(uuid) : null;
  const name = s && s.found ? s.business?.name : null;
  return {
    title: s && s.found ? `طلبك #${s.order_id}${name ? " — " + name : ""}` : "بيجر ركين",
    robots: { index: false, follow: false },
  };
}

export async function generateViewport({ params }: { params: Promise<{ key: string }> }): Promise<Viewport> {
  const { key } = await params;
  const uuid = keyToUuid(key);
  const s = uuid ? await load(uuid) : null;
  const surf = s && s.found && /^#[0-9a-f]{6}$/i.test(s.business?.surf || "") ? s.business!.surf! : "#121212";
  return { themeColor: surf, width: "device-width", initialScale: 1, viewportFit: "cover" };
}

export default async function PagerPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const uuid = keyToUuid(key);
  if (!uuid) {
    return (
      <main className="pg-root pg-bad" dir="rtl">
        <div className="pg-bad-card">
          <b>الرابط غير صحيح</b>
          <span>امسح الباركود اللي على فاتورتك مرة ثانية.</span>
        </div>
      </main>
    );
  }
  const initial = await load(uuid);
  return <PagerClient uuid={uuid} pageKey={key} initial={initial} />;
}
