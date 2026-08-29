---
name: design-critic
description: Self-review gate against the Rakeen (ركين) owner's actual, hard-won taste standards, run BEFORE presenting or deploying any design/landing/UI work — not after it gets rejected. Use before declaring any visual/UI/landing-page task done, before a Cloudflare deploy of a design change, or when asked to review/critique a design. Complements ui-designer (which builds) and product-designer (which scopes) by judging the finished result honestly.
---

# Design Critic — Rakeen

This skill exists because the same mistake was made **five separate times** on Rakeen's landing page before the owner's actual standard was correctly internalized: a full rebuild would pass every technical check, get presented, and get rejected wholesale on taste — "ولا واحد اعجبني" ("not one of them pleased me"). The fix is to run this critique *before* presenting work, using the owner's own past words as the rubric, not generic design-review instinct.

See `checklist.md` in this skill directory for the full round-by-round history this is distilled from.

## Run this pass before calling any visual/UI work done

Go through each item below against the actual built screen (not your intention for it). Any single failure here is grounds to revise before presenting, even if the code is technically correct and fully verified.

1. **Is the real product the visual hero, or is a "concept" competing with it?** A connecting thread line, a narrative device, a metaphor, a multi-concept pitch — all of these have been tried and explicitly rejected. The real POS screen / real receipt / real numbers should dominate; framing should be quiet enough to be invisible.
2. **Is it light and calm, or heavy?** No dark or full-bleed color-block sections. The owner was explicit: "the dark colors make the page too heavy — I picture something bright and clean, built on light backgrounds and large white spaces." If a section is dark, that alone is a rejection-grade issue here, not a style preference to weigh against other factors.
3. **Is there one consistent, repeated template, or does every section reinvent its own idea?** Sameness across sections is the goal, not a compromise — it reads as calm and trustworthy. Check that feature sections literally reuse the same structural pattern (eyebrow/number → title → 1-2 lines → real visual, alternating sides) rather than each getting bespoke treatment.
4. **Is there an invented philosophy or metaphor?** The most recent, most specific standing instruction: "بدون فلسفه كبيرة بدون غثى" — no big conceptual philosophy, no bloat. If you can describe the page's structure using a metaphor name ("One Thread," "The Receipt," "Living Clock"), that's itself a signal to simplify — cut the metaphor and keep only the real feature it was dressed around.
5. **Does it still look like generic AI-SaaS output?** Check against the specific clichés this project has explicitly moved away from: warm-cream+serif+terracotta, near-black+neon accent, gradient-blur hero, floating 3D shapes, huge single-word chapter titles, numbered chapter markers used decoratively rather than because the content is genuinely sequential. A page that could belong to any SaaS company has failed this check even if every individual element is well-executed.
6. **Would the owner recognize their own restaurant in it?** Real menu items, real prices, real invoice line items, real loyalty config — not generic placeholder content. Confirm the actual copy and numbers are the verified real ones (see ui-designer's ground-truth list), not approximations.
7. **Is anything only there to be "impressive" rather than because it's a real, important capability?** Cut it. Five real features shown plainly beat eight features wrapped in a clever presentation.

## How to use this before presenting

State plainly which of the seven checks you ran and whether each passed — don't silently skip the pass and just say "looks good." If something fails, fix it before presenting rather than presenting and waiting for rejection; this project's history shows the owner's rejections are consistent and predictable once you know the standard, so there's no reason to spend another full round finding that out the hard way.

## What this skill is not

It is not a rubber stamp for "matches instructions literally but still feels off" — the owner's real dissatisfaction across rounds 3–5 was aesthetic/emotional even when every literal requirement was met. Judge the *feeling* of the result against the standards above, not just requirement coverage.
