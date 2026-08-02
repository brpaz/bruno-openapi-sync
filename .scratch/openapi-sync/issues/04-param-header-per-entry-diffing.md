# 04 — Param/header per-entry diffing

**What to build:** On re-sync, `http.params` and `http.headers` are reconciled entry-by-entry instead of wholesale-replaced: spec-defined entries stay in sync, user-added entries survive.

**Blocked by:** 03

**Status:** done

- [x] Each `http.params`/`http.headers` entry is matched to the spec by name
- [x] A name present in the spec has its value/required/type regenerated from the spec on every sync
- [x] A name absent from the spec (user-added, e.g. a debug header) is left completely untouched
- [x] A spec-defined name missing from the file (new param/header added upstream) is appended
- [x] Automated test: add a custom header to a synced request, re-sync with an unrelated spec change, assert the custom header survives and spec-defined headers are still correctly updated
- [x] Automated test: spec adds a new required param to an existing operation, re-sync, assert it's appended to the existing request's `http.params`

## Comments

`sync/fields.ts` gained a generic `reconcileEntries()` used for both `http.params` and `http.headers`: walks existing entries preserving unmatched ones verbatim, regenerating matched ones from the spec, then appends any spec entries with no existing match. Confirmed (deliberately, per CONTEXT.md "Param/header entry") that a spec-matched entry's `value` is regenerated too — a user-typed test value in a spec-tracked param does NOT survive a resync, only entirely user-added (unmatched-name) entries do. Added a dedicated test making that explicit so it reads as intentional, not a latent bug. 4 new tests, 21 total passing.
