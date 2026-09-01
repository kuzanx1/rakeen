# Checkpoint 11 — Printer Configuration + Hardware Abstraction Readiness

## SCOPE

Per the user's explicit Checkpoint 11 directive (superseding/detailing
the roadmap's item 11, "Network Printer"): build a real Printer Settings
flow using the existing `PrinterProfile`/`PrinterCapabilities`
architecture (Checkpoint 1), supporting configurable brand/model/
transport/host/port/protocol/paper width/drawer capabilities/drawer
command, never assuming a specific printer model or port 9100, keeping
LAN printing independent of Internet, preserving Cash Drawer as a core
requirement with idempotency and no fake success, and leaving Bluetooth/
USB explicitly unsupported rather than pretended.

`infrastructure/printerConfig.ts` (Checkpoint 6) was a deliberate
placeholder — its own doc comment said so explicitly: *"a real Settings
screen to populate this doesn't exist yet (that's Checkpoint 11...)"*.
This checkpoint is that promised replacement, not a redesign of anything
verified.

## WHAT CHANGED

- `domain/printerProfile.ts` (new) — pure validation
  (`validatePrinterProfile`) and target derivation
  (`profileToPrinterTarget`, `drawerKickCommandFor`,
  `isDrawerSupported`). Zero I/O.
  - **Never assumes port 9100**: a missing or invalid port is a
    validation *error*, not a silently-applied default. A profile with
    port 9100 is valid only because the user typed it — a different
    real port (e.g. 6101) is equally valid, proven by a dedicated
    assertion.
  - **Never assumes a specific brand/model**: `brand`/`model` are free
    text with no whitelist, no Sunmi-specific default anywhere.
  - **Bluetooth/USB explicitly rejected**, not silently accepted:
    `SUPPORTED_TRANSPORTS = ['network']` only, because no native module
    in this app implements them yet (`platform/printer.ts`'s own
    `PrinterCapabilities.supportedTransports` has only ever reported
    `['network']`, from Checkpoint 1). `profileToPrinterTarget` returns
    `null` for either — never fabricates a target for a transport with
    no real implementation.
  - `profileToPrinterTarget`/`drawerKickCommandFor` return honest `null`/
    `undefined` for anything unconfigured, invalid, or explicitly
    declared drawer-less — never a guessed value.
- `infrastructure/printerProfileStore.ts` (new) — real MMKV-backed
  `PrinterProfile` persistence, using Checkpoint 8's already-validated
  flat-cache storage engine, not a new storage decision.
- `ui/PrinterSettingsScreen.tsx` (new) — the real Settings form: brand/
  model, transport picker (network selectable; bluetooth/usb visibly
  present but disabled and labeled "غير مدعوم بعد" — shown, not hidden,
  and never pretending to work), host/port (no pre-filled port), paper
  width presets (58mm/80mm), a cut-capability toggle, a drawer-supported
  toggle, an optional drawer kick command override (base64, validated),
  live validation errors, and a real "Test Connection" button using the
  already-verified `Printer.testConnection()` from Checkpoint 1 —
  explicitly labeled in the UI as proving network reachability only,
  **not** a successful print, per the "never claim physical
  functionality" rule.
- `application/paymentService.ts` — the drawer step now reads the real
  `PrinterProfile` (via `getPrinterProfile()` +
  `profileToPrinterTarget()`/`drawerKickCommandFor()`/
  `isDrawerSupported()`) instead of the placeholder `{host, port}`
  shape. Correctly distinguishes two different honest
  `DRAWER_UNAVAILABLE` causes: nothing configured at all, vs. a
  configured printer whose profile explicitly declares no drawer
  (`drawerCapabilities.supported === false`) — a printer can exist
  without a drawer, and this is now represented rather than collapsed
  into one generic "unavailable." Passes through a real drawer kick
  override when the profile specifies one, otherwise
  `platform/cashDrawer.ts`'s own standard ESC/POS default applies
  (unchanged, not touched this checkpoint). The existing
  `operationId`-based idempotency in `cashDrawer.ts` and the persisted
  `drawer_state` check in `paymentService.ts` (both from Checkpoints 1
  and 6) are **completely untouched** — this checkpoint only changes
  *where the target/capabilities come from*, never the double-tap/
  cross-restart dedup logic itself.
- `application/printService.ts` — same swap for print dispatch:
  `PRINTER_UNAVAILABLE` whenever no valid target is derivable from the
  profile, for whatever specific reason (nothing configured, unsupported
  transport, invalid fields) — one honest outcome, not several
  inconsistent ones.
- Deleted `infrastructure/printerConfig.ts` — fully superseded, zero
  remaining real imports (confirmed via grep before deletion; the three
  leftover mentions were prose in doc comments, updated to the new file
  name).

## WHAT WAS ACTUALLY TESTED

1. **Pure logic** (`domain/printerProfile.ts`) — 29 assertions via
   `npx tsx`, the real file imported directly, temporary script deleted
   immediately after (confirmed via `git status`).
2. `npx tsc --noEmit` across the whole project, including the
   `printerConfig.ts` deletion and both consumer updates — clean.
3. Real CI on both platforms — no new native dependency this checkpoint
   (pure JS/TSX + the already-compiled MMKV/printer/drawer native
   modules from Checkpoints 1 and 8).
4. **Real Supabase backend**: not applicable. Printer configuration and
   target derivation are entirely local/on-device (MMKV read/write,
   pure validation) — nothing in this checkpoint calls a Supabase RPC or
   touches the database, so there is no new backend behavior to verify.

## PASSED

**Pure logic (29/29 assertions)**:
```
Only 'network' is a supported transport
emptyPrinterProfile(): no host/brand guessed, NO default port
validatePrinterProfile: network requires host AND port; port out of
  1-65535 (including 0 and 99999) is invalid; a real host+port (9100 OR
  any other real port, e.g. 6101) is valid -- 9100 is never treated as
  special, just a value the user happened to enter
bluetooth/usb transports are rejected outright, not silently accepted
non-escpos protocol rejected; negative paper width rejected; paper
  width presets are exactly 58mm(384px)/80mm(576px)
drawer kick command base64 validation: invalid string rejected, valid
  string accepted, omitted entirely is valid (falls back to the
  standard default)
profileToPrinterTarget: null/invalid profile -> null (never fabricated);
  a valid network profile -> the real derived target; bluetooth profile
  -> null (no real implementation, never pretended)
isDrawerSupported/drawerKickCommandFor: correctly honor
  drawerCapabilities.supported as the actual gate -- a kick command
  override present on a drawer-less profile is correctly ignored, never
  used
```

CI: **confirmed green on both platforms** (run 33479402784) — `ios` in
5m28s, `android` in 14m8s (`macos-15`/Xcode 16.4), including the
"verify the native modules were actually compiled" safeguard step on
both. No new native dependency this checkpoint. Note: `gh run watch`
hit a transient network error partway through polling and exited
misleadingly early (code 0, before Android had actually finished) — the
final result here is from a direct `gh run view --json status,conclusion`
poll confirming `"status":"completed"`/`"conclusion":"success"` for
both jobs, not from trusting that first exit code.

## FAILED

Nothing — no bugs found in the new domain logic, and the two consumer
updates (`paymentService.ts`, `printService.ts`) were reviewed line by
line against their pre-checkpoint behavior to confirm the only change is
*where the target comes from*, not the payment/print orchestration
logic itself (queue-first persistence order, idempotency checks, and
independent payment/drawer state reporting are all untouched, per the
explicit "do not redesign" instruction).

## FIXED

Nothing needed fixing this checkpoint.

## REMAINS (honest gaps, not glossed over)

- **The Settings screen itself is untested on a real device** — form
  behavior, the "Test Connection" button's real network round-trip, and
  MMKV persistence surviving a real app restart are all unverified from
  this environment (same category as every screen/storage checkpoint
  since Checkpoint 3).
- **No real printer/drawer hardware has been used at all.** "Test
  Connection" proves TCP reachability at best, on a real device, against
  a real printer — none of which has happened here. Physical printing
  and physical drawer kicks remain completely unverified and are not
  claimed as working, per the explicit instruction.
- **Bluetooth/USB remain genuinely unimplemented**, not just
  deprioritized — the Settings screen shows them so a user knows they
  exist as a future option, but selecting them is blocked in the UI and
  rejected by validation if attempted programmatically.
- **No brand/model-specific drawer command library exists** — the
  override field accepts any valid base64 the user provides, but this
  checkpoint doesn't ship pre-built command presets for known printer
  models (out of scope: no real hardware has been used to confirm any
  model-specific command yet, and inventing presets without hardware
  evidence would violate "never assume").

## NEEDS HARDWARE

Everything in REMAINS above requiring a real device, a real network
printer, and a real cash drawer. **No physical printer, drawer,
Bluetooth, USB, or LAN-independent offline behavior is claimed as
working — only the configuration/validation/target-derivation logic
around them is verified.**

**Status: 🟡 Ready for Testing** — the printer configuration domain
logic and Settings UI are implemented and pure-logic-verified (29/29
assertions), correctly wired into the existing, untouched payment/print
orchestration, CI confirmed green on both platforms (verified via a
direct status poll after `gh run watch` itself proved unreliable) /
🔴 Needs Hardware for the screen itself, MMKV persistence on a real
device, and any real printer/drawer operation. Cleared to advance to
Checkpoint 12.
