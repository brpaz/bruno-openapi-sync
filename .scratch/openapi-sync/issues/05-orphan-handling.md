# 05 — Orphan handling

**What to build:** When an operation disappears from the spec, its matched request file is deleted automatically if the user never touched it, or kept with a warning if it has any user-owned content.

**Blocked by:** 03

**Status:** done

- [x] `sync/orphans.ts` classifies every matched file whose `operationId` no longer exists in the current spec
- [x] "Has user-owned content" means any non-empty `runtime` block, any `http.auth` beyond its seeded default, or any param/header entry that survived a diff as user-added (ticket 04's untouched entries)
- [x] An orphan with no user-owned content is deleted automatically
- [x] An orphan with any user-owned content is left in place, and a warning identifying it is surfaced (console output at minimum; full structured plan output lands in ticket 07)
- [x] Automated test: operation removed from spec, file has no user content → file deleted
- [x] Automated test: operation removed from spec, file has a hand-written `runtime` script → file kept, warning present in output

## Comments

Two non-obvious implementation gaps this ticket had to close, both worth flagging:

1. **"Beyond seeded default" needed a real definition.** `http.auth`'s seeded value is always a `{{placeholder}}` string (see `seedAuth` in `sync/fields.ts`). `isUnmodifiedSeededAuth` in `sync/orphans.ts` checks whether the current value/token/username+password still match that placeholder pattern for the auth types we actually seed (apikey/bearer/basic) — any other auth type (oauth2, digest, wsse, ntlm, awsv4) is treated as user-added outright since this tool never seeds those.
2. **"Survived a diff as user-added" has no live spec op to diff against for an orphan** (the operation is gone). Fixed by persisting `generatedParamNames`/`generatedHeaderNames` — the param/header names that _were_ spec-derived as of the last sync — into `.bruno-openapi-sync/state.yml` on every create/update. Orphan classification reads that snapshot instead of re-deriving it. This is new sync-state schema beyond what tickets 02/03 shipped; additive and backward compatible (missing = empty array, no crash on older state files).

`apply/write.ts` now actually deletes files for `plan.deletes` and prunes their `state.operations` entry; `plan.skips` leave both the file and its state entry completely untouched. 3 new tests (including one exercising the auth-heuristic specifically), 24 total passing.
