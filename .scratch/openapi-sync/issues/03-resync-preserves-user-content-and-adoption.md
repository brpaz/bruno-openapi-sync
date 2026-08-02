# 03 — Re-sync preserves user-owned content and respects the adoption rule

**What to build:** Running `sync` again against a collection that already exists and has been hand-edited: generated fields update to match the current spec, everything user-owned survives untouched, and pre-existing files sync doesn't recognize are left completely alone.

**Blocked by:** 02

**Status:** done

- [x] `collection/scan.ts` reads the match-key index (`operationId → file`) from `.bruno-openapi-sync/state.yml`; it does not read match keys out of request files themselves (none exist there)
- [x] Files not present in `state.yml` are never read, written, moved, or deleted by sync at any point (the adoption rule); if `state.yml` itself is missing, every existing file is treated as unrecognized (no fuzzy rebuild)
- [x] If an unrecognized hand-written file happens to describe the same operation as a spec entry, sync creates a second, separate file rather than merging into it — this is expected, not a bug
- [x] On re-sync, generated fields (`info.name`, `http.method`, `http.url`, folder placement — folder moves are ticket 06) are regenerated on matched files even when unchanged from the spec's perspective (still correct, just a no-op)
- [x] A hand-edited `runtime` block (scripts/tests) on a matched file survives a re-sync unchanged
- [x] `http.auth` and `http.body`, once seeded at creation, are never rewritten on a later normal-mode sync even if the user edited them or the spec's underlying schema changed — at most a warning is noted for a changed body schema (surfaced fully in ticket 07's plan output, but the "don't touch the file" behavior must hold here)
- [x] `info.seq` is never recomputed on existing files during re-sync
- [x] Automated test: re-sync with zero spec changes against an already-synced fixture collection produces byte-identical output (core idempotency guarantee)
- [x] Automated test: hand-edit `runtime` + add a custom field on a synced request, re-sync, assert both survive
- [x] Automated test: seed a collection with an unrecognized hand-written file describing the same operation as a spec entry, re-sync, assert the original is untouched and a second file was created

## Comments

Added a `bodySchemaHash` (sha1 of the request-body JSON schema) to the sync-state sidecar, computed on both create and update, to detect a changed body schema across syncs and emit the warning — not explicitly in the original acceptance list but needed to make that bullet actually true rather than aspirational; covered by its own test.

Folder-name collision handling (`collection/scan.ts` `listUsedFileNames`) had to be extended to check real on-disk filenames, not just names allocated within the current sync run — otherwise a newly-created file could silently overwrite an unrecognized hand-written file sharing the same generated name, which would have violated the adoption rule ticket02 shipped without ever hitting (its tests only used empty dirs).

Real-world double- and triple-sync against the live Petstore spec confirmed idempotency outside the fixture tests too: 1st run `19 created`, 2nd run `0 created, 19 updated`, 3rd run same with `git diff --stat` showing zero changes.
