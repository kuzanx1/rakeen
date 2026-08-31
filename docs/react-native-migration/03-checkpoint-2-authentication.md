# Checkpoint 2 — Authentication

## What changed

Real code, layered per the explicit requirement (UI → Application Logic →
Domain Logic → Infrastructure → Native/Storage/Network), all in
`react-native-poc/src/`:

- `infrastructure/supabaseClient.ts` — the same real Supabase project the
  Capacitor app uses (public URL/anon key only — no service role key, DB
  password, or access token anywhere in this project or committed
  anywhere). AsyncStorage as the session storage adapter (Supabase's own
  documented React Native pattern).
- `domain/auth.ts` — plain types (`DeviceConfig`, `CashierProfile`,
  `BranchOption`) matching the real `profiles`/`branches` table shapes,
  no framework/storage/network imports.
- `application/authService.ts` — ported logic from
  `public/pos/rakeen-pos.js`'s real device-provisioning flow and
  `attemptCashierLogin`/`loadCashierProfile`: owner/manager sign-in once
  to provision a business+branch, then day-to-day login via the **same
  existing rate-limited `/api/pos/login` proxy route** — never calling
  `supabase.auth.signInWithPassword()` directly for the PIN, for the exact
  brute-force-protection reason that route's own comment gives. **No
  backend changes.**
- `ui/LoginScreen.tsx` — the first real POS screen ported, not a demo:
  device provisioning (email/password → branch picker if more than one)
  then the 4-digit PIN pad. Functional parity with the current screen's
  behavior, not a redesign.
- `App.tsx` — login is now the primary screen. The printer/drawer hardware
  POC tools from the earlier phase stay reachable behind a button (not
  deleted — still the only way to exercise the printer/drawer path until
  a real order/payment screen exists in a later checkpoint).

## What was tested

Two things, both real:

1. **`npx tsc --noEmit`** — clean.
2. **The actual authentication flow against the live backend** — a
   temporary scratch script (deleted immediately after, confirmed via
   `git status`) executed the *exact same call sequence*
   `authService.ts` implements: owner sign-in → `profiles`/`branches`
   lookup → sign-out → the real, deployed `/api/pos/login` route → session
   set → cashier profile lookup — using the project's existing
   `__test_salon_mvp__` test business (business_id=20, branch_id=24,
   owner `owner-test-salon-mvp@rakeen.internal`, cashier PIN account
   `pos+24@rakeen.internal`).

## What passed

Every step of the real backend test passed:

```
OK owner signed in, user id: 0e96fb22-3cea-459a-933a-f86465bbf8a6
OK profile: { business_id: 20, user_type: 'owner' }
OK branches: [ { id: 24, name: 'test' } ]
OK owner signed out (matches provisionDevice behavior)
OK cashier PIN login succeeded, userId: ff542d91-021e-48aa-9466-bf502646cbce
OK setSession succeeded
OK cashier profile: { id: ..., business_id: 20, branch_id: null, full_name: 'pos+24@rakeen.internal', user_type: 'employee' }
=== ALL STEPS PASSED ===
```

This is the real Supabase project and the real deployed Next.js API
route — not a mock, not a local stand-in.

## What failed / what was fixed

Nothing failed. This checkpoint had no compile or runtime errors to fix.

## What remains

- **Not yet run inside an actual React Native runtime** (Simulator/
  emulator/device) — the backend logic is verified for real, but
  `LoginScreen.tsx` rendering, `AsyncStorage` behavior on-device, and the
  full JS↔native app lifecycle have not been exercised yet. That's the
  next honest gap: CI proves *compile*, the Node script proves the
  *backend logic*, neither proves the *screen* runs correctly on a real
  RN runtime.
- No "forgot password" / session-refresh-failure UI states have been
  built — only the golden path and the existing route's error messages.
- Staff-picker ("who's on duty" attribution, not a real login per the
  original code's own comment) not ported yet — deferred to a later
  checkpoint since it's cosmetic/attribution, not authentication.

## What needs real hardware

Nothing in this checkpoint — no printer/drawer interaction.

**Status: 🟡 Ready for Testing** for the screen itself (compiles — real CI
green on both `macos-15`/Xcode 16.4 and `ubuntu-latest` after adding
Supabase/AsyncStorage — not yet run on a device/simulator) / **🟢 Verified**
for the underlying authentication logic and backend contract (actually
executed against the live backend, real result, not assumed).
