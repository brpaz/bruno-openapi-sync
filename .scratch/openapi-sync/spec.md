# Bruno OpenAPI Sync

Status: ready-for-agent

## Problem Statement

Teams that maintain an OpenAPI spec alongside a Bruno collection have to hand-update the Bruno collection every time the spec changes — new endpoints, renamed operations, changed parameters. Existing OpenAPI→Bruno converters (including Bruno's own `@usebruno/converters`) only do a one-shot, full regeneration: running them against a collection that already has hand-written content (test scripts, auth setup, example payloads, custom headers) destroys that work. There's no tool that treats an OpenAPI spec as the source of truth for a Bruno collection's _structure_ while leaving everything a human added by hand alone.

## Solution

A CLI (`bruno-openapi-sync sync`) that syncs a Bruno collection, in the OpenCollection YAML format (Bruno v3.1+), from an OpenAPI spec, in place, repeatedly. Every request/environment file in the collection is split into fields sync always regenerates (a **generated field** — the spec unconditionally wins), fields sync writes once at creation and then leaves alone (a **seeded field**), and fields sync never touches at all (a **user-owned field**). An operation's `operationId` is the **match key** that lets sync find "the same" request across runs even if it moves folders or gets renamed on disk. An explicit `--overwrite` flag suspends all of this and makes the spec win everywhere, for when a clean regeneration is actually wanted. A `--dry-run` flag previews the plan without writing anything.

## User Stories

1. As an API maintainer, I want to run `sync` against my existing hand-edited Bruno collection and see it pick up new spec endpoints, so that I don't have to manually recreate requests for every new operation.
2. As an API maintainer, I want my hand-written test scripts (`runtime` blocks) preserved across every sync run, so that I never lose testing work by re-running the tool.
3. As an API maintainer, I want my manually-configured `http.auth` preserved after I've edited it, so that sync doesn't reset my token/credentials setup.
4. As an API maintainer, I want a best-effort `http.auth` default written the first time a request is created from a spec operation with a security scheme, so that I don't start from a completely blank auth config.
5. As an API maintainer, I want my hand-filled example request bodies preserved across syncs, so that realistic test payloads I typed in don't get reset to placeholder values.
6. As an API maintainer, I want an initial example request body generated from the operation's schema the first time a request is created, so that I have a reasonable starting point instead of an empty body.
7. As an API maintainer, I want custom headers or params I added by hand (not present in the spec) to survive a sync, so that debug/tracing headers I rely on locally don't get silently wiped.
8. As an API maintainer, I want spec-defined params/headers to have their value/required/type kept in sync automatically, so that the request stays valid as the spec's parameter contracts evolve.
9. As an API maintainer, I want environment files generated once from the spec's `servers` list when my collection has no environments yet, so that I get a working `baseUrl` setup without hand-authoring it.
10. As an API maintainer, I want my environment files left alone after that first generation, so that secrets and env-specific values I add later are never touched or regenerated.
11. As an API maintainer, I want every generated request URL to reference `{{baseUrl}}` rather than a hardcoded host, so that switching Bruno environments actually changes which server I'm hitting.
12. As an API maintainer, I want requests placed into folders based on the operation's first OpenAPI tag, so that my collection's structure roughly mirrors the spec's grouping without manual folder creation.
13. As an API maintainer, I want a request's folder to move automatically if its operation's first tag changes in the spec, so that folder structure doesn't drift from the spec over time.
14. As an API maintainer, I want sync to fail loudly and clearly if any operation in the spec is missing an `operationId` or has a duplicate one, so that I catch spec authoring mistakes before they corrupt the match-key tracking.
15. As an API maintainer, I want a request file whose operation was removed from the spec to be deleted automatically if I never added anything to it, so that my collection doesn't accumulate dead requests for endpoints that no longer exist.
16. As an API maintainer, I want a request file with user-added content whose operation was removed from the spec to be kept and flagged with a warning instead of deleted, so that I don't lose work just because an endpoint got removed upstream.
17. As an API maintainer, I want pre-existing hand-written request files (with no match key) to be left completely alone by sync, so that adopting this tool on a collection I already built by hand doesn't silently rewrite files it can't prove ownership of.
18. As an API maintainer, I understand that if an unrecognized hand-written file happens to describe the same operation as a spec entry, sync will create a second file rather than guess they're the same — and I can manually delete/merge the duplicate myself.
19. As an API maintainer, I want an `--overwrite` flag that makes the spec win everywhere unconditionally (including seeded and user-owned fields), so that I have an explicit escape hatch for a clean, forced regeneration when I actually want one.
20. As an API maintainer, I want a `--dry-run` flag that shows me exactly what would be created/updated/moved/deleted/skipped without touching disk, so that I can review risky changes (especially deletions) before they happen.
21. As an API maintainer, I want to point `sync` at either a local spec file or a spec URL, so that I can sync directly against a hosted/live spec without downloading it first.
22. As an API maintainer, I want sync to reject Swagger 2.0 specs with a clear error rather than attempt to process them, so that I get an actionable message instead of confusing partial/incorrect output.
23. As an API maintainer, I want running `sync` a second time with no spec changes to produce a byte-identical collection (no-op), so that I can trust the tool isn't introducing spurious diffs into version control.
24. As an API maintainer running `sync` against a brand-new/empty output directory, I want the tool to bootstrap a valid `opencollection.yml` collection root, so that first-time use doesn't require pre-creating collection scaffolding by hand.
25. As an API maintainer, I want new operations appended to the end of the existing manual ordering (`info.seq`) rather than spliced into spec-declared position, so that reordering I've done in the Bruno UI isn't disrupted by new endpoints.

## Implementation Decisions

- **Language/tooling**: TypeScript on Node, package-managed with pnpm. CLI framework `commander`. OpenAPI parsing/validation via `@apidevtools/swagger-parser` (dereferences `$ref`s, validates OpenAPI 3.0/3.1). YAML via `js-yaml`. Internal object-model validation via `zod`. Build via `tsdown`. Tests via `vitest`.
- **`@usebruno/schema` spike**: before building the merge engine, install `@usebruno/schema`/`@usebruno/converters` and check whether they export usable types/schemas for the OpenCollection **YAML** format specifically (not just legacy `bruno.json`/`.bru`). Reuse if usable; otherwise hand-roll TS types for `opencollection.yml`, `folder.yml`, request `.yml`, and environment `.yml` shapes from the official OpenCollection YAML docs. `@usebruno/converters`'s OpenAPI conversion logic itself is explicitly **not** reused — its one-shot, no-merge model doesn't fit a repeatable sync.
- **Module layout**:
  - `spec/load.ts` — fetch (URL) or read (file) the spec, parse via swagger-parser; reject anything not OpenAPI 3.0.x/3.1.x before any further processing.
  - `spec/operations.ts` — flattens the spec into an `Operation[]` (`operationId`, `method`, `path`, `tags`, `security`, request body schema, params, headers). Throws with all offending `operationId`s listed if any operation is missing one or has a duplicate.
  - `collection/scan.ts` — builds a `Map<operationId, ExistingFile>` by reading `.bruno-openapi-sync/state.yml`, a sidecar this tool owns exclusively (not by reading a field out of each request file — `@opencollection/types` has no per-request extension point, and Bruno's own schema validation is strict `noUnknown`, so an added field risks silent loss on the app's own save round-trip). Files with no entry in `state.yml` are never indexed and stay invisible to the rest of the pipeline (the **adoption** rule); a missing/deleted `state.yml` means every existing file is treated as unrecognized, with no fuzzy-rebuild fallback.
  - `collection/types.ts` — TS types for the OpenCollection YAML shapes (from the spike above).
  - `sync/fields.ts` — the single place encoding the generated/seeded/user-owned rules from `CONTEXT.md`, exposed as `reconcileRequest(op, existingFile | null, mode)` and `reconcileEnvironments(servers, existingEnvDir | null, mode)`, called identically for both creation and update so the rules never fork between code paths.
  - `sync/orphans.ts` — classifies request files whose match key no longer exists in the spec as delete-safe (no user-owned content) or skip-with-warning (any user-owned content present).
  - `sync/plan.ts` — combines the above into a single `SyncPlan { creates, updates, moves, deletes, skips, warnings }`.
  - `apply/write.ts` — applies a `SyncPlan` to disk; not invoked at all under `--dry-run`.
  - `apply/render.ts` — renders a `SyncPlan` to human-readable output, used both for `--dry-run` output and the summary printed after a real run.
  - `index.ts` — exports the single library seam: a `sync(spec, collectionDir, mode)`-shaped function that `cli.ts` and all tests call directly.
  - `cli.ts` — thin `commander` wrapper: `sync --spec <path-or-url> --output <collection-dir> [--overwrite] [--dry-run]`. No other flags or subcommands for v1.
- **Field classification** (see `CONTEXT.md` for full definitions):
  - Generated (always regenerated): `info.name`, `http.method`, `http.url` (`{{baseUrl}}` + spec path template), folder placement (from `tags[0]`, root if untagged).
  - Generated with per-entry diffing: `http.params`/`http.headers` — entries matched by name; spec-matched names get value/required/type regenerated, unmatched (user-added) names are left as-is, missing spec entries are appended. `--overwrite` replaces the array wholesale instead.
  - Seeded (written once at creation, or under `--overwrite`; otherwise never touched, changes trigger a plan warning instead): `http.auth`, `http.body`, `info.seq`, and environment files under `environments/*.yml` (generated only if the directory is empty at first sync).
  - User-owned (never written by sync under any circumstance except `--overwrite`): everything not listed above — `runtime` blocks, `settings`, any custom keys.
- **Match key**: the spec's `operationId`. Required and must be unique across the spec; violations abort the sync before any file is touched. Persisted only in `.bruno-openapi-sync/state.yml` (see **Sync state** below), never inside request YAML files.
- **Sync state**: `.bruno-openapi-sync/state.yml`, a sidecar at the collection root mapping `operationId → file path`, owned exclusively by this tool. Bruno's app never reads or writes it. See `docs/adr/0002-sync-state-sidecar-not-in-request-files.md` for why this replaced the original plan of storing the key inside each request file.
- **Orphan handling**: a previously-synced request whose `operationId` is gone from the spec is deleted automatically if it has no user-owned content, or left in place with a warning in the plan output if it has any.
- **Adoption**: no fuzzy matching by method+URL against pre-existing hand-written files. Unrecognized files are permanently invisible to sync; an overlapping spec operation produces a second, separate file rather than a merge.
- **CLI bootstrap**: if `--output` doesn't contain `opencollection.yml`, sync creates a minimal one — first run against an empty/nonexistent directory is treated as the normal case, not an error.
- **Spec source**: `--spec` accepts either a local file path or an `http(s)://` URL.
- **`--overwrite`**: suspends every rule above; the spec wins unconditionally for every field in every file.
- **`--dry-run`**: builds and renders the `SyncPlan` without calling `apply/write.ts`.

## Testing Decisions

- Single primary seam: the library function in `src/index.ts` (`sync(spec, collectionDir, mode)`). All behavioral tests drive this function directly against fixture specs and fixture collection directories (copied to a tmp dir per test) — not through the CLI.
- Good tests here assert on external behavior only: the resulting files on disk (or the returned `SyncPlan` for `--dry-run` cases), never on internal call sequencing between modules.
- Unit tests for the smaller pure modules (`spec/operations.ts`, `sync/fields.ts`, `sync/orphans.ts`) using small in-memory fixtures, no filesystem needed.
- Required fixture-based end-to-end cases (`test/`, using `test/fixtures/specs/` and `test/fixtures/collections/`):
  - Fresh/empty output dir → full creation, seeded fields populated, `info.seq` assigned in spec order.
  - Re-sync with no spec changes → byte-identical output (idempotency; this is the core guarantee the tool exists to provide and must be an explicit test, not incidental).
  - Re-sync after a user hand-edits a `runtime` script and adds a custom header → both survive untouched.
  - Operation removed from spec, file has no user content → file deleted.
  - Operation removed from spec, file has user content → file kept, warning present in the plan/output.
  - Operation's first tag changed → file physically moved to the new folder.
  - `--overwrite` against a hand-edited collection → user edits gone, spec wins everywhere.
  - `--dry-run` → no filesystem writes occur; plan output matches expected create/update/move/delete/skip breakdown.
  - Missing `operationId` and duplicate `operationId` → sync throws before touching any file, with a message listing the offending operation(s).
  - Swagger 2.0 spec input → rejected before any processing, clear error message.
- No dedicated CLI-level test suite for v1 beyond one manual smoke test (see Verification/further notes) — `cli.ts` is a thin argument-parsing wrapper around the one library seam.

## Out of Scope

- Fuzzy/heuristic adoption of pre-existing hand-written collections by method+URL matching (explicitly rejected — see Adoption decision).
- Swagger 2.0 / OpenAPI 2.0 support.
- Multiple servers mapping to anything beyond one environment file per `server` entry generated once (no ongoing sync of new servers into new env files after first creation).
- Watch mode / continuous sync (v1 is a single invocation per run).
- Migrating an existing `.bru`-format collection to YAML (this tool only operates on OpenCollection YAML collections).
- A confirmation prompt before applying changes — default behavior applies directly (no `--yes` gate), since `--dry-run` exists for review and this tool is expected to run in CI/automation.

## Further Notes

- Full domain vocabulary (generated/seeded/user-owned field, match key, orphaned request, folder placement, adoption, overwrite mode, generated URL, param/header entry) is defined in `CONTEXT.md` at the repo root — implementation and tests should use these exact terms.
- The rationale for the field-ownership architecture (vs. full regeneration or 3-way merge against a stored spec snapshot) is recorded in `docs/adr/0001-field-level-ownership-sync.md`.
- A detailed module-by-module implementation plan already exists at `/home/bruno/.claude/plans/sunny-kindling-peacock.md` (not yet approved/executed) and should be treated as the starting point for whoever picks this spec up.
- Manual verification beyond the automated test suite: run `sync` against a small real public spec (e.g. Petstore 3.1) into a fresh directory and open the result in the actual Bruno app to confirm it loads as valid OpenCollection YAML and requests are runnable; then re-run with no spec change and confirm zero diff on disk.
