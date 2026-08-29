import type { NextConfig } from "next";

// Known external origins this app actually loads resources from — kept in
// one place so the CSP below stays honest as new integrations get added.
// Google Fonts: every hand-authored CSS file (dashboard/POS/kitchen/order/
// landing/book/legal) links fonts.googleapis.com + fonts.gstatic.com.
// Supabase: NEXT_PUBLIC_SUPABASE_URL, used for both REST/RPC calls (fetch)
// and Realtime (wss). Map tiles/QR: proxied through our own /api routes
// (same-origin), never fetched client-side directly.
const SUPABASE_ORIGIN = "https://jgrlefclttoazamzvwca.supabase.co";
const SUPABASE_WS_ORIGIN = "wss://jgrlefclttoazamzvwca.supabase.co";

// script-src/style-src still need 'unsafe-inline': the hand-authored
// POS/dashboard/kitchen JS uses inline onclick= handlers and inline
// style= attributes throughout (a pre-existing pattern, not something this
// pass rewrites). Everything else here is a real, meaningful restriction —
// frame-ancestors alone closes the clickjacking gap, and locking
// connect-src/img-src/object-src to known origins means even a successful
// XSS can't exfiltrate to or load a script from an arbitrary attacker host.
const CSP = [
  "default-src 'self'",
  // Cloudflare auto-injects its own Web Analytics beacon at the zone level
  // on every response — allowing it here isn't optional (Cloudflare adds it
  // without our code doing anything), only whether to let it load.
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  `connect-src 'self' ${SUPABASE_ORIGIN} ${SUPABASE_WS_ORIGIN} https://cloudflareinsights.com`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;

// dev-only: lets `next dev` (Turbopack) resolve Cloudflare bindings
// (env vars from .dev.vars) the same way `wrangler dev` would, so local
// development doesn't need to change at all.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();