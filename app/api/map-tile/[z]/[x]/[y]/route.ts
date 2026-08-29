import { NextRequest, NextResponse } from "next/server";

// Proxies OpenStreetMap's public tile server for the online-order page's
// location-pin correction widget. No map SDK/library is used anywhere in
// this app — this is the one piece of code that touches map imagery, so it
// stays a thin server-side proxy rather than pulling in Leaflet/Mapbox.
// Proxying (instead of hotlinking tile.openstreetmap.org from the browser)
// identifies the app via a real User-Agent and lets Cloudflare's edge cache
// tiles aggressively, both required by OSM's tile-usage policy.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ z: string; x: string; y: string }> }
) {
  const { z, x, y } = await params;
  if (!/^\d+$/.test(z) || !/^\d+$/.test(x) || !/^\d+$/.test(y)) {
    return NextResponse.json({ error: "invalid tile coordinates" }, { status: 400 });
  }
  try {
    const upstream = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, {
      headers: { "User-Agent": "Rakeen-POS/1.0 (https://rakeen-sa.workers.dev; restaurant online-ordering location picker)" },
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: "tile fetch failed" }, { status: upstream.status });
    }
    const buf = await upstream.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "tile fetch failed" }, { status: 502 });
  }
}
