---
name: tailwind-css-expert
description: Tailwind CSS v4 expertise, scoped to Rakeen (ركين)'s actual, limited use of Tailwind. Use when explicitly asked to build something with Tailwind, when auditing or cleaning up the unused Tailwind scaffold in app/globals.css, or when evaluating whether a new isolated surface should use Tailwind vs this project's hand-authored-CSS convention. Do not use to justify introducing Tailwind utility classes into existing hand-authored CSS routes (landing, dashboard, POS, kitchen, order, loyalty-card) — those follow senior-frontend-engineer's convention instead.
---

# Tailwind CSS Expert — Rakeen

## First, the honest state of this repo

Tailwind v4 (`tailwindcss` + `@tailwindcss/postcss`) is installed and `app/globals.css` contains only `@import "tailwindcss";` — but **no real screen in this product actually uses Tailwind utility classes.** Every shipped surface (landing page, dashboard, POS, kitchen display, online storefront, order tracking, loyalty card) is hand-authored plain CSS with `:root` custom-property tokens, as covered in `ui-designer` and `senior-frontend-engineer`. Tailwind here is unused create-next-app scaffold, not the project's design system.

**Do not "helpfully" convert an existing hand-authored file to Tailwind classes, and do not add Tailwind utility classes alongside an existing plain-CSS file for the same route.** Mixing paradigms on one surface makes it harder to maintain, not easier, and directly contradicts this codebase's established convention (see senior-frontend-engineer: match the pattern already in the file you're editing).

## When Tailwind actually applies here

- The user explicitly asks for Tailwind, or for a brand-new, fully isolated surface with no existing CSS convention to match.
- Auditing/removing the unused scaffold if it's ever flagged as dead weight.
- If the project ever makes a deliberate, explicit decision to migrate a surface to Tailwind — in which case, port the existing CSS custom-property tokens (e.g. `--paper #FBFAF5`, `--ink #171717`, `--lime #C4FF2B`, `--lime-deep #7BAD0F`, `--stone #EFEEE7`) into Tailwind v4's CSS-first `@theme` block so the visual language survives the migration exactly, rather than reaching for Tailwind's default palette/scale.

## Tailwind v4 specifics (for when it does apply)

- V4 is CSS-first: no `tailwind.config.js` is required by default. Configuration and custom tokens go in CSS via `@theme { --color-brand: #...; --font-display: ...; }` inside the file that has `@import "tailwindcss";`.
- Arbitrary values (`w-[42px]`, `text-[13.5px]`) are fine for one-offs, but repeated custom values belong in `@theme` as named tokens — treat this the same discipline as this project's own `:root` variables: no magic numbers scattered across markup.
- RTL: Tailwind v4 supports logical utilities (`ps-4`/`pe-4`, `ms-*`/`me-*`, `start-*`/`end-*`) — always prefer these over `l-*`/`r-*` physical utilities on anything that renders under `dir="rtl"`, matching the logical-properties discipline senior-frontend-engineer enforces in hand-authored CSS. The same RTL+transform pitfall applies: don't pair a logical positioning utility with a physical `translate-x-*` utility.
- Dark mode: this product's actual dark surface is the POS kiosk theme, not a `prefers-color-scheme` toggle — if using Tailwind's dark variant anywhere, confirm it's meant to track OS preference and not conflict with the POS's own explicit light/dark setting.
- Keep bundle discipline in mind: Tailwind's JIT only includes classes it can statically find, so avoid fully dynamic class-name construction (`` `text-${color}-500` ``) — use a lookup map of complete class strings instead.

## If asked to evaluate "should this be Tailwind or hand-authored CSS"

Default answer for this project: hand-authored CSS with tokens, to match every existing surface and this project's own established taste (see ui-designer, design-critic). Recommend Tailwind only for a genuinely new, isolated tool/internal surface with no visual continuity requirement to the rest of the product — and say so explicitly rather than silently picking one.
