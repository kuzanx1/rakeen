# Phase 6 — Cash Drawer Contract

`CashDrawer.open({ target, kickCommandBase64?, timeoutMs })` — see
`react-native-poc/src/platform/cashDrawer.ts`.

- **Does not assume every printer/drawer uses the same kick command.**
  `kickCommandBase64` is optional; when omitted, both
  `RakeenCashDrawerModule.swift` and `RakeenCashDrawerModule.kt` use the
  same standard ESC/POS default (`0x1B 0x70 0x00 0x19 0xFA`, pin 2,
  ~25ms/250ms) already used and documented on the Capacitor/Swift side
  (`ios/App/App/MainViewController.swift`) — kept identical rather than
  reinvented, per the instruction to build on the existing design.
- **No speculative per-model capability system was built.** A real
  override mechanism exists (`kickCommandBase64`), but nothing constructs
  one yet — exactly the same "structure exists, not populated with
  fabricated data" approach as `PrinterCapabilities` in Phase 3.
- **Classification: 🟡 Ready for Testing, explicitly not "Works."** Neither
  the iOS nor Android drawer module has been run against real hardware.
  The standard kick command is a reasonable, well-established default,
  not a confirmed fact about any specific drawer this project will
  actually encounter.
