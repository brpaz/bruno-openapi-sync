# 01 — Project scaffold + OpenCollection YAML type spike

**What to build:** A buildable, testable TypeScript project skeleton, and a resolved answer to whether `@usebruno/schema`/`@usebruno/converters` provide usable types for the OpenCollection **YAML** format (not just legacy `bruno.json`/`.bru`). This is prefactoring, not a demoable slice — it exists to make ticket 02 straightforward.

**Blocked by:** None — can start immediately

**Status:** done

- [x] `pnpm install` / `pnpm build` (tsdown) / `pnpm test` (vitest) all succeed on an empty/trivial codebase
- [x] CLI entrypoint (`commander`) parses `sync --spec <path> --output <dir> [--overwrite] [--dry-run]` and exits with a clear "not implemented" message — no sync logic yet
- [x] Spike: install `@usebruno/schema` and `@usebruno/converters`, inspect what they export for OpenCollection YAML (`opencollection.yml` / `folder.yml` / request `.yml` / environment `.yml`)
- [x] `collection/types.ts` exists with TS types for those four YAML shapes — reusing `@usebruno/schema`'s types if the spike found them usable, otherwise hand-rolled from the OpenCollection YAML docs
- [x] Decision from the spike (reuse vs hand-roll, and why) is left as a short comment or note near `collection/types.ts` for future reference
- [x] `@apidevtools/swagger-parser`, `js-yaml`, `zod` are installed as dependencies (not yet wired into logic)

## Comments

Spike found `@usebruno/schema`/`@usebruno/converters` model Bruno's legacy internal object shape (strict Yup `noUnknown`, old `http-request` type naming), not the OpenCollection YAML-at-rest format. Used the official `@opencollection/types` package instead (re-exported in `src/collection/types.ts`) — verified against a real Bruno-generated collection found on disk, matches field-for-field.

This spike also surfaced a problem with the original match-key plan (storing `operationId` inside each request file): `@opencollection/types` has no per-request extension point, and Bruno's strict schema validation makes round-trip preservation of an unrecognized field unreliable. Revised to a sidecar file (`.bruno-openapi-sync/state.yml`) instead — see `docs/adr/0002-sync-state-sidecar-not-in-request-files.md`. `CONTEXT.md`, `spec.md`, and tickets 02/03 were updated accordingly.
