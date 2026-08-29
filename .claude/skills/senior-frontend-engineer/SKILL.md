---
name: senior-frontend-engineer
description: Frontend implementation craft and verification discipline for Rakeen (ركين) — writing and reviewing TSX/CSS/JS in this specific codebase, RTL-safe CSS, and the project's build/verify/deploy ritual. Use whenever writing or editing frontend code in app/, public/dashboard, public/pos, or public/order, before declaring frontend work done, or before running a Cloudflare deploy. Not for visual/product decisions (see ui-designer, product-designer) or final taste review (see design-critic).
---

# Senior Frontend Engineer — Rakeen

Rakeen's frontend has no component framework beyond React for structure and no CSS framework in real use (Tailwind v4 exists only as unused scaffold boilerplate in `app/globals.css`). Each route is a client component importing a hand-authored plain CSS file, plus older screens (`dashboard`, `pos`, `order`, `kitchen`, `loyalty-card`) implemented as vanilla JS bundles injected via `document.createElement('script')` rather than React. **Match the pattern already in the file you're editing.** Do not introduce a new paradigm (Tailwind classes, a component library, a state library) into an existing surface without being asked.

## Non-negotiable: read the platform docs first

`AGENTS.md` at the repo root is explicit: **this is Next.js 16 canary with breaking changes from your training data.** Before using any App Router API you're not already certain about in this exact version, read `node_modules/next/dist/docs/` rather than relying on prior knowledge. This has caused real bugs before.

## RTL is the default, not a mode

Arabic/RTL is the primary and default layout direction across the whole product. The one recurring, real bug class here: **mixing a logical CSS property with a physical transform.** `inset-inline-start:50%` combined with `transform:translateX(-50%)` does not compose correctly under `dir="rtl"` — it pushes the element off to the wrong side. Fix is either:
- Fully logical: `inset-inline:12px; margin-inline:auto` (no transform), or
- Fully physical: `left/right` + a matching physical transform, never mixed.

Also watch for: numeric/mono content (prices, dates, order numbers) needs `direction:ltr; unicode-bidi:isolate` so digits and mono formatting don't get bidi-reordered inside RTL flow (see `.mono` in `rakeen-landing.css`).

## The verification ritual (run this before saying you're done)

1. `npx tsc --noEmit` — must be clean.
2. `npx next build` — must complete; watch for the TypeScript pass inside the build too.
3. **CSS survival check**: Next's build minifier (lightningcss) can silently drop malformed or unusual hand-authored CSS. After a build, grep the compiled chunk for every new selector you added: `grep -l ".your-new-class" .next/static/chunks/*.css`. A selector present in source but absent from every compiled chunk means it was dropped — find and fix the malformed rule, don't just re-run the build.
4. **Overflow check on mobile (375px) and tablet (768px)** via the Browser tool: `document.querySelectorAll('*')` and compare `el.scrollWidth` against `document.documentElement.clientWidth` — anything wider than the viewport is a real bug even if it "looks fine" in a screenshot.
5. **This session's Browser pane never composites frames** — `document.hidden` stays `true`, so `requestAnimationFrame`, `IntersectionObserver`, and CSS transitions never actually fire while you're testing. Don't trust "it should just work"; either manually simulate the observer callback / call the animation function directly via `javascript_tool` and check the resulting DOM/state, or rely on `setTimeout`-driven logic (which does run) as the verification proxy. Never claim a scroll-triggered or IO-triggered feature "works" without this workaround.
6. If `next build`'s typecheck throws nonsensical errors referencing truncated/garbled identifiers, suspect a corrupted `.next/dev/types/validator.ts` from an interrupted dev-server write, not your source change — `rm -rf .next` (fully regenerable) and rebuild before debugging further.

## Deploy hygiene

Before `npm run cf:deploy`, check for stale processes holding a lock on `.open-next`: look for orphaned `workerd`/`next dev` processes and kill/stop them properly — stop a dev server via its own tool (`preview_stop`) rather than killing its process manually, which can orphan a child and reintroduce the same lock. `npm run cf:deploy` runs `opennextjs-cloudflare build && deploy`; the target runtime is Cloudflare Workers, not Node — avoid Node-only APIs unless the project has already set up `nodejs_compat`.

## Code style for this repo

- No dead abstractions: this codebase favors small, direct, repeated functions (e.g. `animateNumber`, the `.reveal`/IntersectionObserver pattern reused verbatim across the landing page) over a shared engine, especially across independently-loaded `<script>` bundles with no guaranteed execution order.
- No comments explaining *what* code does; a short comment is fine only for a genuinely non-obvious constraint (e.g. the RTL+transform gotcha above).
- Never trust client-sent numbers for anything financial — recompute VAT/totals server-side (see `complete_pos_order`, `compute_vat_split`) even if the client already computed them correctly; this codebase had a real trust-boundary bug here.
