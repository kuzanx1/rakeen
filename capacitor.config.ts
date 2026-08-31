import type { CapacitorConfig } from '@capacitor/cli';

// Architecture decision (documented here since it's the thing most likely to
// look "wrong" to someone opening this file cold): this app is NOT bundled
// into the native shell. `webDir: 'public'` is only present because the
// Capacitor CLI requires *some* local folder to exist and to run `cap sync`
// against — it is not what the WKWebView actually shows.
//
// Instead, `server.url` points the WKWebView directly at the real, already
// deployed Cloudflare-hosted app, the same origin the browser/PWA cashier
// already uses. Reasons this is the right call for THIS app specifically,
// not just the path of least resistance:
//   1. This is a Next.js app with server-rendered routes, API routes
//      (/api/pos/*, /api/send-owner-push, etc.) and Supabase auth/session
//      cookies — not a static SPA. Bundling it locally would mean either
//      running a full Next server inside the app (not what Capacitor is for)
//      or forking the POS into a separate static build, which the user has
//      explicitly said NOT to do ("لا نعيد كتابة الكاشير" / no architecture
//      redesign).
//   2. Every offline/queue mechanism already built (IndexedDB queue, print
//      queue, kv_cache snapshot) is designed around this exact origin's
//      Supabase calls and same-origin fetches — pointing the shell at that
//      same origin means zero behavior change is required in rakeen-pos.js.
//   3. A cashier who also opens the plain browser PWA (e.g. on a spare
//      tablet during a hardware swap) hits the identical app, so there is
//      only ever one deployed version of the POS to keep in sync.
//
// NOT YET VERIFIED (needs Mac/Xcode): whether WKWebView's session storage
// for a remote https:// origin loaded this way behaves identically to a
// real Safari tab in every respect Supabase's auth/session refresh depends
// on. Treated as "Likely" in docs/ios-wkwebview-review.md, not "Verified".
const config: CapacitorConfig = {
  appId: 'com.rakeen.cashier', // placeholder — must match the real Apple Developer bundle ID once one is chosen; see docs/ios-xcode-guide.md
  appName: 'Rakeen Cashier',
  webDir: 'public',
  server: {
    url: 'https://rakeenapp.com/pos',
    cleartext: false,
  },
  ios: {
    // WKWebView content inset handling for the notch/home-indicator safe
    // areas — 'automatic' matches what a normal Safari tab does. Not
    // verified against the POS's own safe-area CSS until run on a real
    // device; see docs/ios-wkwebview-review.md.
    contentInset: 'automatic',
  },
};

export default config;
