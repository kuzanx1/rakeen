# Phase 3 — Unified Printer Contract

Real TypeScript, not just prose — see
`react-native-poc/src/platform/printer.ts` and `cashDrawer.ts` for the
actual contract. Summary of the design decisions:

- **`Printer.print / testConnection / getStatus / capabilities`** — the
  exact four methods requested, matching the shape already proven for the
  Capacitor/Swift side (`docs/ios-native-bridge-interfaces.md` §4) rather
  than inventing something new.
- **Network only, for real.** `PrinterTransportKind` is a 3-value type
  (`network`/`bluetooth`/`usb`) so the *shape* supports more later, but
  `PrinterCapabilities.supportedTransports` is what a caller should
  actually trust at runtime — a build with only the network transport
  wired up reports `['network']`, not the full enum. Bluetooth/USB are
  never claimed working just because the type permits them.
- **Port is never defaulted inside the contract.** `PrinterTarget.port` is
  optional at the type level (so a target can be constructed before a
  Settings value is known) but every native implementation treats a
  missing port as `invalid_target`, not "assume 9100." The 9100 *default
  value* belongs in a Settings UI text field's placeholder — a UX
  convenience — never inside the transport code itself. This directly
  carries over the same rule already enforced and verified on the
  Capacitor/Swift side (`docs/ios-native-bridge-interfaces.md` §4a).
- **ESC/POS raw bytes, base64, opaque to native code** — same principle as
  today: whatever renders the receipt (Canvas today, something else in a
  real RN port, see Phase 1's audit) builds complete bytes; native code
  transports them without understanding Arabic text, codepages, or fonts.
- **Paper width** is a *declared capability*, not something native code
  acts on — matches how the current architecture already puts 100% of
  rendering decisions on the JS side.
- **Explicit timeout** (`PrintJob.timeoutMs`) instead of an implicit
  native constant — a small improvement over today's undocumented 8s
  default, made explicit here since this is a fresh contract anyway.
- **Cash drawer kick command is overridable, not hardcoded per-model** —
  `kickCommandBase64` is optional; omitting it uses the same standard
  ESC/POS default the Capacitor/Swift side already uses. This satisfies
  "don't assume every printer uses the same drawer command" without
  inventing a speculative capability system nothing uses yet.
