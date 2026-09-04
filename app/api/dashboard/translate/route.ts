import { NextRequest, NextResponse } from "next/server";

// Instant translate button on the product-name editor (Arabic <-> English) —
// proxies MyMemory's free public translation API, not a paid Cloud
// Translation API key — provisioning billing for one button that merchants
// can always bypass by typing the other name themselves isn't worth it.
// An earlier version proxied Google Translate's unauthenticated web-client
// endpoint instead; that worked from a local dev machine but Google
// CAPTCHA-blocks Cloudflare Workers' shared egress IPs with a 429 "unusual
// traffic" page (confirmed live via wrangler tail), so it was effectively
// broken in production. MyMemory is a purpose-built public API (not a
// scraped endpoint) and doesn't hit the same block. Best-effort only, same
// posture as /api/reverse-geocode: if this ever fails or is unavailable, the
// dashboard just leaves the field for the merchant to fill in by hand.
export async function POST(request: NextRequest) {
  let body: { text?: string; target?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const text = (body.text || "").trim().slice(0, 200);
  const target = body.target === "ar" ? "ar" : "en";
  const source = target === "ar" ? "en" : "ar";
  if (!text) {
    return NextResponse.json({ error: "missing text" }, { status: 400 });
  }

  try {
    const upstream = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${source}|${target}`
    );
    if (!upstream.ok) {
      return NextResponse.json({ error: "translate failed" }, { status: 502 });
    }
    const data: { responseStatus?: number; responseData?: { translatedText?: string } } = await upstream.json();
    const translated = (data.responseData?.translatedText || "").trim();
    if (!translated || data.responseStatus !== 200 || /MYMEMORY WARNING/i.test(translated)) {
      return NextResponse.json({ error: "translate failed" }, { status: 502 });
    }
    return NextResponse.json({ translated });
  } catch {
    return NextResponse.json({ error: "translate failed" }, { status: 502 });
  }
}
