# Protecting the Current System During the React Native Migration

This is the binding safety contract for the whole migration, restated in
writing so it survives across sessions. It does not change unless the
user explicitly changes it.

## Baseline

`master` (real production POS: `public/pos/rakeen-pos.js`, `app/pos/*`,
Capacitor `ios/App/`) is the baseline. As of this migration's start
(2026-08-31), `master`'s HEAD is commit `8d4b706`. Confirmed by direct
diff that `react-native-poc` (and therefore this branch, which starts from
it) made **zero changes** to `ios/App/`, `capacitor.config.ts`, or
`public/pos/rakeen-pos.js` relative to `master` — the only difference is
the *addition* of the `react-native-poc/` folder, its docs, and its CI
workflow.

## Rollback procedure (concrete, not aspirational)

At any point, reverting to the exact working production state is:

```bash
git checkout master
```

Nothing more is needed — `master` was never modified by this migration.
If `master` itself ever needs to move forward independently (a real
production bugfix) while this migration is in progress, that work happens
on `master` directly and gets merged into `react-native-migration`
afterward — never the other way around.

## Standing rules for this migration (per explicit instruction)

1. `master`/Capacitor are never deleted.
2. The current Capacitor app is never modified in a way that makes it
   unrunnable — if a shared file (Supabase schema, an RPC signature) must
   change for the migration, it must remain backward-compatible with the
   still-running Capacitor app until that app is actually retired.
3. Backend/Supabase changes only when strictly necessary, and reviewed
   for backward compatibility with `master` first.
4. Existing, working, tested business logic is ported and adapted, not
   redesigned from scratch, wherever it's usable.
5. **The current IndexedDB offline queue is not deleted until its React
   Native replacement exists AND is tested.**
6. **The current print queue is not deleted until its React Native
   replacement exists AND is tested.**
7. **The current native bridge (`ios/App/App/PrinterManager.swift` etc.)
   is not deleted until the React Native replacement is confirmed
   working.**
8. Every migration milestone below has its own explicit rollback point —
   a commit/tag that represents "this milestone's replacement is not yet
   trusted, `master` is still the thing actually serving cashiers."

## What "done" means for the migration, per milestone

Every milestone in `docs/react-native-migration/01-roadmap.md` gets the
same classification discipline used throughout this whole project:
🟢 Verified (real, run, tested) / 🟡 Ready for Testing (built, not yet
proven against real hardware/backend) / 🔴 Needs Hardware. A milestone is
never marked complete on "the code exists" alone.
