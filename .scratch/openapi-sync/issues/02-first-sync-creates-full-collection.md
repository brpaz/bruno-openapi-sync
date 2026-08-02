# 02 — First sync creates a full collection from a spec

**What to build:** Running `bruno-openapi-sync sync --spec <spec> --output <empty-or-nonexistent-dir>` against a fresh output directory produces a complete, valid OpenCollection YAML collection that loads and runs correctly in the actual Bruno app — one request file per spec operation, correctly foldered, with generated fields set and seeded defaults populated.

**Blocked by:** 01

**Status:** done

- [x] `--spec` accepts either a local file path or an `http(s)://` URL
- [x] Spec is validated as OpenAPI 3.0.x or 3.1.x; anything else (including Swagger 2.0) is rejected before any processing with a clear error message
- [x] Every operation is required to have an `operationId`; sync aborts before writing anything if any operation is missing one or if any two collide, and the error lists every offending operation
- [x] `operationId` is recorded as the match key in `.bruno-openapi-sync/state.yml` (a sidecar this tool owns, mapping `operationId → file path`) — never written into the request YAML file itself, since Bruno's own schema validation is strict `noUnknown` and can't be trusted to round-trip an extra field
- [x] If `--output` has no `opencollection.yml`, one is bootstrapped automatically (fresh/nonexistent dir is the normal case, not an error)
- [x] Generated fields are correct on every created request: `info.name`, `http.method`, `http.url` as `{{baseUrl}}` + the spec's path template (never an absolute URL)
- [x] Requests are placed into folders by the operation's first tag (`folder.yml` created as needed); untagged operations land at the collection root
- [x] Seeded fields are populated on creation: `http.auth` best-effort default from the operation's security scheme, `http.body` example generated from the operation's request schema, `info.seq` assigned in spec order starting from an empty collection
- [x] `environments/*.yml` is generated, one file per spec `servers` entry (name from `server.description` or index, value from `server.url`), only because the collection had no environments yet
- [x] Resulting collection opens in the actual Bruno app without errors, and a generated request is runnable — **partially verified**, see Comments
- [x] Automated test: fresh/empty output dir + fixture spec → assert on the full resulting file tree and key field values

## Comments

Manual smoke test run against the real hosted Swagger Petstore 3.0 spec (`https://petstore3.swagger.io/api/v3/openapi.json`, exercising the URL-loading path no automated test covers) into a fresh `/tmp` dir — output structurally matches a real Bruno-generated OpenCollection YAML collection found on disk during ticket 01's spike, field-for-field (`info`/`http`/`docs` shape, `{{baseUrl}}`/`:param` URL style, apiKey auth block). **This sandbox has no GUI**, so the "opens in the actual Bruno app" criterion could only be verified structurally (matches the known-good reference collection, round-trips through `js-yaml`), not by actually launching the app — flagging this gap rather than claiming it as fully done.

13 automated tests added in `test/sync-create.test.ts`, all passing, covering every acceptance criterion above except the GUI check.

Confirmed the ticket 03 boundary is respected: re-running sync against an already-synced collection currently throws `"Updating existing operation ... is not implemented yet (ticket 03)"` rather than silently misbehaving.
