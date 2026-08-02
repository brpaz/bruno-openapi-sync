# 06 — Folder placement follows tag changes

**What to build:** When an operation's first OpenAPI tag changes, the next sync physically moves its request file to the matching folder instead of leaving it stranded in the old one.

**Blocked by:** 03

**Status:** done

- [x] On re-sync, if a matched operation's first tag no longer matches the folder its file currently lives in, the file is moved to the correct folder (creating the destination `folder.yml` if needed)
- [x] An operation moving from tagged to untagged (or vice versa) moves the file between a folder and the collection root correctly
- [x] A folder left empty after a move is not force-deleted just because it's empty (only content-driven decisions, no incidental cleanup)
- [x] Automated test: change an operation's first tag in the fixture spec between two syncs, assert the file lives in the new folder afterward and not the old one

## Comments

Found and fixed a latent issue from ticket02 while implementing this: `folder.yml` was being unconditionally regenerated (fresh `seq`, rewritten) for every folder touched in a sync run, with no check for whether it already existed on disk. It never showed up as a bug because folder-encounter order was always stable run-to-run in prior tests, but it would have broken the very "already-existing folder.yml untouched" property this ticket depends on. Fixed by threading real on-disk folder-existence data (`scan.ts`'s `scanExistingFiles`, replacing the narrower `listUsedFileNames`) into `build-plan.ts`'s `ensureFolder()`, which now only queues a `folder.yml` write for a folder that doesn't already have one. Added a dedicated regression test for this (`does not rewrite an already-existing folder.yml for a folder nothing moved into`).

A move is represented as a `plan.moves` entry (`fromPath`/`toPath`) plus a normal `plan.updates` entry whose `filePath` is the new location — `apply/write.ts` writes the new file (via the updates loop, already existing) then deletes the stale file at `fromPath`. 4 new tests (retag to another folder, retag to root, move-then-resync stability, folder.yml non-rewrite regression), 28 total passing.
