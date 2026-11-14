import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getLandingClients, LandingClient } from "@/lib/landingClients";

// Public: the logos for the landing page's customers strip. Only what the
// admin chose to show, and only name + logo (both already public on each
// store). Cached briefly per isolate and at the browser, so a busy landing
// page costs two small queries a minute at most.
let cache: { at: number; clients: LandingClient[] } | null = null;
const TTL = 60_000;

export async function GET() {
  if (!cache || Date.now() - cache.at > TTL) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ clients: [] });
    try {
      cache = { at: Date.now(), clients: await getLandingClients(createClient(url, key)) };
    } catch {
      return NextResponse.json({ clients: cache?.clients || [] });
    }
  }
  return NextResponse.json(
    { clients: cache.clients.map((c) => ({ logo: c.logo, name: c.name })) },
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}
