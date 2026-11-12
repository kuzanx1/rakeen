"use client";

import { useEffect } from "react";

// عدّاد «روابطك»: زيارة واحدة لكل فتح، وضغطة لكل زر (data-lid). بلا
// كوكيز ولا هوية زائر -- أرقام يومية فقط لصاحب المطعم (link_page_hit).
function hit(slug: string, link: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return;
  fetch(`${url}/rest/v1/rpc/link_page_hit`, {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json", apikey: anon, Authorization: `Bearer ${anon}` },
    body: JSON.stringify({ p_slug: slug, p_link: link }),
  }).catch(() => {});
}

export default function HitTracker({ slug, name }: { slug: string; name: string }) {
  useEffect(() => {
    const key = "lk-seen-" + slug;
    let seen = false;
    try { seen = sessionStorage.getItem(key) === "1"; sessionStorage.setItem(key, "1"); } catch {}
    if (!seen) hit(slug, "");
    const onClick = (e: MouseEvent) => {
      const sh = (e.target as Element | null)?.closest?.("[data-share]") as HTMLElement | null;
      if (sh) {
        // مشاركة الجوال الأصلية، وإلا ننسخ الرابط ونقول «نُسخ».
        const url = location.href.split("#")[0];
        if (navigator.share) navigator.share({ title: name, url }).catch(() => {});
        else navigator.clipboard?.writeText(url).then(() => {
          sh.setAttribute("data-done", "");
          setTimeout(() => sh.removeAttribute("data-done"), 1800);
        }).catch(() => {});
        hit(slug, "share");
        return;
      }
      const a = (e.target as Element | null)?.closest?.("a[data-lid]");
      if (a) hit(slug, a.getAttribute("data-lid") || "");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [slug, name]);
  return null;
}
