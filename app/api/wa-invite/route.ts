import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getWaInvite, WA_INVITE_BASE_ROUND } from "@/lib/waInvite";

// اللوحة تسأل مرة وحدة عند الفتح: وش رقم جولة نافذة الواتساب الحالية؟
// رقم بس، بدون أي بيانات ثانية، فما يحتاج تسجيل دخول.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let round = WA_INVITE_BASE_ROUND;
  if (url && key) {
    try {
      round = (await getWaInvite(createClient(url, key))).round;
    } catch {}
  }
  return NextResponse.json({ round }, { headers: { "Cache-Control": "public, max-age=60" } });
}
