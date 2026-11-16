import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { buildOverview } from "@/lib/adminOverview";

// «نظرة عامة» في /admin — الحساب كله في lib/adminOverview.ts.
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ("response" in guard) return guard.response;
  const out = await buildOverview(guard.admin);
  return "error" in out ? NextResponse.json({ error: out.error }, { status: 500 }) : NextResponse.json(out);
}

