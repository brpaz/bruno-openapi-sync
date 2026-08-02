# 07 — `--overwrite` and `--dry-run` flags

**What to build:** An explicit escape hatch that makes the spec win everywhere unconditionally, and a preview mode that shows the full plan without writing anything — covering every reconciliation rule built in tickets 02–06.

**Blocked by:** 04, 05, 06

**Status:** done

- [x] `--overwrite` suspends every field-ownership rule at once: seeded fields (`http.auth`, `http.body`, `info.seq`, environment files) are regenerated from the spec even on existing files, `http.params`/`http.headers` are replaced wholesale instead of per-entry diffed, orphans with user content are deleted instead of skipped-with-warning
- [x] `sync/plan.ts` produces a single `SyncPlan { creates, updates, moves, deletes, skips, warnings }` that both normal and overwrite runs go through
- [x] `apply/render.ts` renders a `SyncPlan` to human-readable output covering every action type
- [x] `--dry-run` builds and renders the plan but never calls the file-writing step — zero filesystem changes, verified by test
- [x] `--dry-run` and `--overwrite` are independent and combinable (preview what an overwrite would do)
- [x] Automated test: `--overwrite` against a hand-edited collection → user edits gone everywhere, spec wins
- [x] Automated test: `--dry-run` against a collection with a pending create, update, move, delete, and skip all present → assert no files change on disk and the rendered plan lists all five correctly

## Comments

`--overwrite` was already accepted as a CLI flag and threaded down to `mode` since ticket 02, but `mode` was completely inert until now — nothing branched on it anywhere. This ticket made it real: `sync/fields.ts`'s `updateRequest` now branches on mode (reseed auth/body, wholesale-replace params/headers, reassign `seq` off a seq counter shared across creates and overwrite-updates in spec order); `build-plan.ts`'s orphan pass deletes-instead-of-skips under overwrite; environment generation bypasses the "only if empty" gate under overwrite.

One deliberate boundary, tested explicitly: `runtime` (hand-written scripts) is **not** reset by `--overwrite` — there's no spec-derived equivalent to overwrite it _with_, so CONTEXT.md's "spec wins everywhere" only applies to fields that have a spec-derived value in the first place.

`apply/render.ts` replaces the inline summary string `cli.ts` had been building since ticket 02 — single `renderPlan()` used for both `--dry-run` preview and the real-run summary. CLI-level smoke test (not just the library-seam tests) confirmed against the real Petstore spec: `--dry-run` never even creates the output directory; `--overwrite` on a second run shows `19 updated` with reseeded content. 2 new tests, 30 total passing.
