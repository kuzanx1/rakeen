import { NextRequest, NextResponse } from "next/server";

// Proxies OpenStreetMap's free Nominatim reverse-geocoding service so the
// online-order page can show a real street address next to the location
// pin instead of raw coordinates — the customer reads a sentence, not a
// lat/lng pair, and only needs to touch the pin if that sentence is wrong.
// Server-side proxy (not called directly from the browser) because
// Nominatim's usage policy requires a real identifying User-Agent and rate
// limits abusive direct client traffic — same posture as /api/map-tile.
export async function GET(request: NextRequest) {
  const lat = request.nextUrl.searchParams.get("lat");
  const lng = request.nextUrl.searchParams.get("lng");
  if (!lat || !lng) {
    return NextResponse.json({ error: "missing lat/lng" }, { status: 400 });
  }
  try {
    const upstream = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&accept-language=ar&zoom=18&addressdetails=1`,
      { headers: { "User-Agent": "Rakeen-POS/1.0 (https://rakeen-sa.workers.dev; restaurant online-ordering location picker)" } }
    );
    if (!upstream.ok) {
      return NextResponse.json({ error: "geocode failed" }, { status: upstream.status });
    }
    const data: {
      display_name?: string;
      address?: { road?: string; house_number?: string; neighbourhood?: string; suburb?: string; city?: string; postcode?: string };
    } = await upstream.json();
    const a = data.address || {};
    const parts = [a.road, a.house_number, a.neighbourhood || a.suburb, a.city].filter(Boolean);
    const address = parts.length ? parts.join("، ") : data.display_name || null;
    return NextResponse.json(
      { address, postcode: a.postcode || null },
      { headers: { "Cache-Control": "public, max-age=300" } }
    );
  } catch {
    return NextResponse.json({ error: "geocode failed" }, { status: 502 });
  }
}
