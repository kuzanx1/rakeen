---
name: motion-designer
description: Interaction and motion design for Rakeen (ركين) — scroll reveals, number counters, transitions, and micro-interactions across the landing page, dashboard, and POS. Use when adding or reviewing any animation, transition, hover/active state, scroll-triggered reveal, or loading/counting effect. Not for static visual styling (see ui-designer) and not for verifying that motion code actually works in this session's Browser tool (see senior-frontend-engineer for the verification workaround, applied below).
---

# Motion Designer — Rakeen

## House motion philosophy

Motion here supports real data, it doesn't decorate emptiness. The signature motion moment in this product is a profit or stock number **counting up to a real, already-verified figure** (e.g. صافي الربح animating to 6,290) — not an abstract loading spinner or a decorative particle effect. Motion earns its place only when it makes a real state change legible (data arriving, a step completing, an element entering view) — the owner has explicitly rejected pages that stacked multiple competing "clever" visual devices at once. When in doubt, prefer restraint: one clear motion idea, applied consistently, beats several simultaneous ones.

`prefers-reduced-motion: reduce` must always be respected — the existing landing CSS already sets `* { animation-duration:.01ms !important; transition-duration:.01ms !important; }` under that media query; carry this into any new stylesheet you write for this product.

## Established, reusable patterns — extend these, don't reinvent

- **`.reveal` fade-up**: `opacity:0; transform:translateY(20px)` → `.reveal.in { opacity:1; transform:translateY(0) }`, transition `.7s cubic-bezier(.16,1,.3,1)`, with `.d1`/`.d2` stagger-delay modifier classes. Triggered by an `IntersectionObserver` at `threshold:0.35` adding/removing `.in` on `[data-reveal]` sections and their `.reveal` children — reveals should reverse (remove `.in`) when scrolling back out, so re-entering a section replays it, matching this project's existing behavior.
- **`animateNumber(el, from, to, duration, formatter)`**: a cubic-eased (`1 - Math.pow(1-t,3)`) `requestAnimationFrame` counter, generation-tagged (`el._animGen`) so a re-triggered animation cleanly cancels any in-flight one instead of racing it. Reuse this exact helper (or its signature) for any new counting figure rather than writing a new tween.
- **Bar/waterfall fills**: width-based CSS transitions on a `.track > .fill` pair (see `.stock-fill`, `.wf-fill`), triggered alongside the section's reveal — width goes from `0%`/absent to its real target percentage only once the section is in view, so the "growth" reads as caused by scrolling to it.

## Verifying motion in this environment

The Browser tool in this session does not composite frames while the pane isn't actively displayed/focused (`document.hidden` stays `true`), which means `requestAnimationFrame`, `IntersectionObserver` callbacks, and CSS transitions **do not fire** during automated testing here, and `computer {action:"screenshot"}` will time out. This is a tooling limitation, not a sign the code is broken — do not skip verification because of it. Instead:

1. Read the trigger logic and confirm it's wired to the right element/selector.
2. Use `javascript_tool` to directly invoke the same code path the observer would call (e.g. manually add the `.in` class and call `animateNumber(...)` with the real target values), then read the resulting DOM state back to confirm formatting, target values, and class toggling are correct.
3. Treat `setTimeout`-based logic as reliable in this session (it does run) and prefer it as your proxy check when comparing against `rAF`/IO-driven code you can't watch execute live.
4. Never report a scroll-triggered or IO-triggered animation as verified-working based on a screenshot alone in this session — state plainly that visual/frame-based confirmation wasn't possible and that you verified the logic and DOM output instead.

## Timing and easing reference

- Reveal transitions: `.7s cubic-bezier(.16,1,.3,1)` (a soft ease-out), stagger delays in `.1s` increments (`d1`, `d2`).
- Number counters: cubic ease-out (`1 - (1-t)^3`), duration scaled to how large/important the number is (700–900ms for headline P&L figures in this product).
- Keep durations short for operator-facing surfaces (POS, dashboard) where speed of feedback matters more than cinematic feel; landing/marketing surfaces can afford slightly longer, calmer timing.
