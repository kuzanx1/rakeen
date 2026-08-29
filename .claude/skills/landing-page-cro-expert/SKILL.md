---
name: landing-page-cro-expert
description: Conversion-focused copy and layout craft for Rakeen (ركين)'s landing page and online-order storefront — CTAs, pricing presentation, trust signals, and Arabic-RTL conversion nuances. Use when writing or reviewing landing-page/storefront copy, CTA placement or wording, pricing display, or anything meant to move a real visitor toward trying or ordering from Rakeen. Not a substitute for design-critic's taste review or product-designer's scoping.
---

# Landing Page CRO Expert — Rakeen

Rakeen's landing page sells a real product to real restaurant owners; the online storefront (`app/order/[slug]`) converts a real customer's hunger into a real paid order. Both need to be persuasive **without ever fabricating anything** — this is a real business, and invented testimonials, invented customer logos, or invented review counts would be dishonest and would erode the one thing this product is selling: trustworthy handling of the owner's money and VAT.

## What's already proven to convert here

- **One clear CTA, stated plainly**: "ابدأ الآن" / "جرّب ركين" — a single primary action per screen, not a CTA competing with a secondary "learn more."
- **Transparent pricing shown as a real number**, not a "contact us": "149 ر.س شهريًا" pattern, with a short honest qualifier ("الأسعار تقديرية للتوضيح") rather than hidden pricing.
- **The real product as proof**, not claims about the product. A real POS screen, a real receipt with a real ZATCA QR, a real profit waterfall using real figures — this converts better here than adjective-heavy copy, and it's the direction the owner has repeatedly pushed toward after rejecting more "concept"-driven pitches.
- **Plain, calm, specific copy** in Saudi Arabic register — short sentences, concrete nouns (كاشير، مخزون، ضريبة) over abstract SaaS language (حلول، منظومة متكاملة، تجربة استثنائية). Specific beats clever, matching this project's established design voice.

## Working checklist for any landing/storefront change

1. **Every claim must be checkable against the real product.** Before writing "compliant with ZATCA," confirm the actual receipt/QR implementation does what the copy says. Don't let copy get ahead of the code.
2. **CTA hierarchy**: exactly one primary action visible per section/viewport; secondary actions (if any) are visually and verbally subordinate.
3. **Friction audit for the storefront specifically**: every extra field, step, or required login before a customer can order is a real conversion cost — check `submit_online_order`'s actual required fields against what's on-screen and cut anything not truly required (this product already deliberately made "directions" optional and added a lightweight phone-confirm step instead of full auth).
4. **RTL-specific CRO details**: in Arabic RTL layouts, the natural reading/scanning flow runs right-to-left, so primary CTAs and "next step" affordances should sit where RTL reading naturally lands (typically the visual left as the flow's end-point, not copy-pasted from an LTR template) — check this concretely against the actual rendered layout rather than assuming an LTR pattern mirrors correctly.
5. **No manufactured trust signals.** No fake "used by X restaurants," no fake star ratings, no stock-photo "happy customer" — if real social proof exists (a real customer, a real number), use it accurately; if it doesn't exist yet, don't invent it.
6. **Mobile is the primary device for the storefront** — a hungry customer is very likely ordering from a phone; verify the ordering flow (menu → cart → checkout → confirm) has zero horizontal overflow and large enough tap targets before calling it done (see accessibility-expert).

## Handoff

Copy and structural CRO decisions here should be checked against `product-designer` (does the flow itself make sense) and `design-critic` (does it still match the owner's established calm/plain visual taste) before shipping — a "converts well" layout that reintroduces dark sections or invented concepts will still get rejected on taste grounds regardless of CRO merit.
