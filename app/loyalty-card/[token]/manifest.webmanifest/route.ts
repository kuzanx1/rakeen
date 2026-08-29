import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// A real per-business web app manifest — this is what lets a customer "save
// the card as an app" with the restaurant's own name/icon on their home
// screen, not a generic "Rakeen" icon. Also what unlocks Web Push on iOS
// Safari, which only allows the Push API for home-screen-installed PWAs.
export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "server not configured" }, { status: 500 });
  }
  const sb = createClient(supabaseUrl, anonKey);
  const { data } = await sb.rpc("get_loyalty_card", { p_token: token }).single();
  const card = data as { business_name: string; logo_url: string | null; accent_color: string } | null;
  if (!card) {
    return NextResponse.json({ error: "card not found" }, { status: 404 });
  }

  // never fall back to Rakeen's own icon — a business with no uploaded logo
  // still gets a letter avatar in their own accent color, not our branding
  const accent = card.accent_color || "#C4FF2B";
  const letter = card.business_name.trim().charAt(0) || "؟";
  const fallbackSvg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'><rect width='512' height='512' rx='96' fill='${accent}'/><text x='256' y='300' font-family='system-ui,sans-serif' font-size='260' font-weight='800' fill='#171717' text-anchor='middle'>${letter}</text></svg>`;
  const icon = card.logo_url || `data:image/svg+xml;base64,${Buffer.from(fallbackSvg).toString("base64")}`;
  const manifest = {
    name: "ولاء - " + card.business_name,
    short_name: "ولاء - " + card.business_name,
    start_url: `/loyalty-card/${token}`,
    scope: `/loyalty-card/${token}`,
    display: "standalone",
    background_color: "#F7F4EF",
    theme_color: accent,
    dir: "rtl",
    lang: "ar",
    icons: [{ src: icon, sizes: "any", type: card.logo_url ? "image/png" : "image/svg+xml", purpose: "any maskable" }],
  };

  return new NextResponse(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" },
  });
}
