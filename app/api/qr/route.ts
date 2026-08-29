import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

// Generates a real, scannable QR code as SVG server-side (the `qrcode`
// package — small, well-tested, MIT). Used for the loyalty card page's own
// code and for the POS's post-checkout "scan to save your card" prompt, so
// the encoding logic lives in exactly one place.
export async function GET(request: NextRequest) {
  const data = request.nextUrl.searchParams.get("data");
  if (!data) {
    return NextResponse.json({ error: "missing data" }, { status: 400 });
  }
  try {
    const svg = await QRCode.toString(data, { type: "svg", margin: 1, color: { dark: "#111111", light: "#00000000" } });
    return new NextResponse(svg, {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=300" },
    });
  } catch {
    return NextResponse.json({ error: "failed to generate QR" }, { status: 500 });
  }
}
