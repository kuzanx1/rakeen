---
name: accessibility-expert
description: Accessibility and inclusive-usability review for Rakeen (ركين)'s RTL Arabic UI — contrast, focus states, touch targets, semantic HTML, and reduced-motion support across the dashboard, POS, landing page, and storefront. Use when writing or reviewing any interactive UI, before declaring UI work done, or when asked to check accessibility/contrast/keyboard support. Complements design-critic (taste) and senior-frontend-engineer (implementation correctness) rather than replacing either.
---

# Accessibility Expert — Rakeen

Accessibility here isn't a compliance checkbox — the POS is operated fast, sometimes one-handed, sometimes in bright kitchen lighting, sometimes under stress at checkout; the dashboard is often checked briefly on a phone; the landing page and storefront serve the general public. Real usability constraints and accessibility requirements overlap heavily on this product — treat them as the same review, not two separate passes.

## RTL correctness is an accessibility issue here, not just a visual one

`dir="rtl"` must be set correctly at the right ancestor level, and logical CSS properties must be used throughout (see senior-frontend-engineer's RTL note on the transform+logical-inset bug) — a control that's visually in the wrong place under RTL is also a screen-reader/focus-order problem, since focus order and visual order should match.

## Checklist to run on any interactive UI

1. **Color contrast**, checked against this product's actual token palettes, not assumed: `--paper #FBFAF5` / `--ink #171717` (landing, light) and the POS dark theme (`--lime #C7FF4D` on dark backgrounds). Lime is an accent, not a text color — never set body/label text in lime on paper, or vice versa, without checking real contrast ratio; it fails easily at small sizes.
2. **Visible keyboard focus state** on every interactive element (buttons, links, form fields, custom controls like the payment-step popup or the platform picker) — a browser default outline being suppressed without a deliberate replacement is a real regression, not a style cleanup.
3. **Touch target size** on the POS and mobile storefront/landing — cashier-facing buttons need to be comfortably tappable under time pressure and imprecise touch (kiosk hardware, gloved or wet hands are plausible in a kitchen context); don't shrink product/category grid cells purely for visual density without checking real tap accuracy.
4. **Semantic HTML over div-soup**, matching this codebase's plain-HTML-via-JSX style: real `<button>` for actions (not a `<div onClick>`), real `<label>`-to-input association on every form field (Settings, invoice modal, checkout), heading levels that actually nest in document order rather than being chosen for font-size convenience.
5. **Icon-only controls need an accessible name** — the POS and dashboard use compact icon buttons in several places (order actions, delivery platform buttons, More screen); each needs `aria-label` or equivalent text alternative, not just a tooltip.
6. **`prefers-reduced-motion` support** on any new animation — the landing CSS already has a project-wide reduced-motion override; carry the same pattern into any new stylesheet (see motion-designer).
7. **Status conveyed by more than color alone** — the invoice-scan review badge (🟢/🟡), delivery-stage states, and shift/order statuses already pair color with an icon/label; keep that pattern for any new status indicator rather than color-only signaling.
8. **Offline and error states are real, expected states here**, not edge cases — the POS's offline queue and the incoming-order/reject flows need clear, non-color-only feedback that something is queued, pending, or failed, since network interruption is normal operating conditions for this product.

## How to verify in this environment

Where a live visual/contrast check isn't possible (this session's Browser tool doesn't composite frames, so screenshots can time out — see senior-frontend-engineer), verify programmatically instead: read computed styles via `javascript_tool` (`getComputedStyle`), check DOM structure via `read_page`/accessibility tree rather than relying on a screenshot, and compute contrast ratios from the actual resolved colors rather than eyeballing a token name.
