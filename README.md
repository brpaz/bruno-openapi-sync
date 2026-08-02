# bruno-openapi-sync

> Sync an OpenAPI spec into a [Bruno](https://www.usebruno.com/) collection (OpenCollection YAML) — repeatedly, safely, without clobbering anything you've hand-edited.

Most OpenAPI → Bruno converters are one-shot: point them at a spec, get a fresh collection, done. Re-run them and any test scripts, custom auth, or example payloads you added by hand are gone. `bruno-openapi-sync` is built to be re-run — every field is either **generated** (always regenerated from the spec), **seeded** (written once on creation, then left alone), or **user-owned** (never touched), so the spec can be the source of truth for structure while your work in Bruno survives.

> [!NOTE]
> **AI-assisted / vibe-coded project, built for personal use.** This tool was built end-to-end with an AI coding agent, from requirements-gathering through implementation and tests, with a human reviewing decisions and steering scope along the way. It's tested (30 tests, all passing) and has been run against a real hosted spec, but it hasn't seen production use. Use it at your own risk — read the code before trusting it with a collection you care about.

### Why not Bruno's own built-in OpenAPI sync?

Bruno's Electron app has a native "sync collection from OpenAPI source" feature (`bruno.json`'s `openapi` config: `sourceUrl`, `groupBy`, `autoCheck`, etc.) — but it's gated behind a paid plan. This tool is a free, open, CLI-based alternative: no app-side license check, works in CI/scripts, and (being closer to the metal) can implement the field-level ownership model above rather than a simpler regenerate-on-check.

## Quick Start

```bash
git clone <this-repo>
cd bruno-openapi-sync
pnpm install
pnpm build

node dist/cli.mjs sync --spec https://petstore3.swagger.io/api/v3/openapi.json --output ./my-collection
```

Open `./my-collection` in Bruno. Change the spec, run the same command again — your edits stay, the structure stays in sync.

## Features

- **Safe re-sync** — generated fields (`method`, `url`, folder placement) always update; user-owned fields (`runtime` scripts, hand-added headers, edited auth/body) never do
- **Field-level, not file-level, ownership** — a single request file can mix spec-derived and hand-written content; sync only ever touches the parts it owns
- **Orphan handling** — a request whose operation was removed from the spec is deleted automatically if untouched, or kept with a warning if you've added anything to it
- **Folder sync** — requests move between folders automatically when an operation's tag changes
- **`--overwrite` escape hatch** — when you do want a clean, forced regeneration, one flag suspends every ownership rule
- **`--dry-run` preview** — see exactly what would change (create/update/move/delete/skip) before anything is written
- **No hidden state in your request files** — match-key tracking lives in a sidecar (`.bruno-openapi-sync/state.yml`), never in a field Bruno's own app might strip

## Installation

Not yet published to a registry — run from source:

```bash
git clone <this-repo>
cd bruno-openapi-sync
pnpm install
pnpm build
```

`dist/cli.mjs` is then a runnable Node ESM script. Link it locally to use the `bruno-openapi-sync` command anywhere:

```bash
pnpm link --global
bruno-openapi-sync sync --spec ./openapi.yaml --output ./my-collection
```

**Requirements**: Node.js ≥ 18, [pnpm](https://pnpm.io/).

## Usage

```
bruno-openapi-sync sync --spec <path-or-url> --output <dir> [--overwrite] [--dry-run]
```

| Flag                 | Required | Description                                                                                       |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `--spec <pathOrUrl>` | yes      | Local file path or `http(s)://` URL to an OpenAPI 3.0.x/3.1.x spec (Swagger 2.0 is rejected)      |
| `--output <dir>`     | yes      | Bruno collection directory. Created/bootstrapped automatically if it doesn't exist yet            |
| `--overwrite`        | no       | Suspend all field-ownership rules — the spec wins everywhere, including fields you've hand-edited |
| `--dry-run`          | no       | Print the plan (creates/updates/moves/deletes/skips) without writing anything                     |

### Examples

```bash
# First sync — creates the collection from scratch
bruno-openapi-sync sync --spec ./openapi.yaml --output ./my-collection

# Re-sync after the spec changed — updates structure, keeps your edits
bruno-openapi-sync sync --spec ./openapi.yaml --output ./my-collection

# Preview what a sync would doapidevtools/swagger-parser
bruno-openapi-sync sync --spec ./openapi.yaml --output ./my-collection --dry-run

# Force a clean regeneration, discarding hand-editsapidevtools/swagger-parser
bruno-openapi-sync sync --spec ./openapi.yaml --output ./my-collection --overwrite
```

Sample output:apidevtools/swagger-parser

```
Did update pets/List all pets.yml
Did move pets/Find pet by ID.yml -> animals/Find pet by ID.yml
Did delete pets/Create a pet.yml
Did skip deleting Health check.yml (has a runtime block (scripts/tests/assertions/variables))
1 created, 2 updated, 1 moved, 1 deleted, 1 skipped.
warning: Kept orphaned request at Health check.yml (operation "getHealth" is no longer in the spec) — has a runtime block (scripts/tests/assertions/variables).
```

## How field ownership works

Every request/environment file is split into three kinds of field:

- **Generated** — `info.name`, `http.method`, `http.url`, folder placement, and per-entry-matched `http.params`/`http.headers`. Always overwritten from the spec on every sync.
- **Seeded** — `http.auth`, `http.body`, `info.seq`, and environment files. Given a best-effort default the first time a request is created, then left alone on every later sync — even if you edit them, even if the spec changes.
- **User-owned** — everything else: `runtime` scripts, `settings`, custom headers/params you added by hand, any extra key you add to the file. Never touched.

The match key linking a spec operation to its file across syncs is the spec's `operationId`, tracked in `.bruno-openapi-sync/state.yml` — never written into the request file itself (Bruno's own schema validation can't be trusted to preserve an unrecognized field through an open-and-save round trip).

Full rationale is in [`CONTEXT.md`](./CONTEXT.md) and [`docs/adr/`](./docs/adr/).

## Development

```bash
pnpm install
pnpm test        # vitest
pnpm typecheck    # tsc --noEmit
pnpm build        # tsdown -> dist/
```

Tests live in `test/`, fixture OpenAPI specs in `test/fixtures/specs/`. The whole tool is exercised through one library seam — `sync()` in `src/index.ts` — which the CLI and every test call directly.

## Project status

Feature-complete against its original spec (`.scratch/openapi-sync/spec.md`): spec loading (local/URL, 3.0/3.1 only), first-sync collection creation, safe re-sync, per-entry param/header diffing, orphan handling, folder-move-on-retag, and `--overwrite`/`--dry-run`. See `.scratch/openapi-sync/issues/` for the ticket-by-ticket history.

## License

ISC
