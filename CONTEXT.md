# Bruno OpenAPI Sync

A CLI that syncs an OpenAPI spec into a Bruno collection (OpenCollection YAML format), regenerating spec-derived request data without clobbering user-owned content.

## Language

**Generated field**:
A field inside a request/folder/collection YAML file whose value is derived from the OpenAPI spec and is fully owned by sync — overwritten every run with no regard for prior content.
_Avoid_: Synced field, managed field

**User-owned field**:
A field inside a request/folder/collection YAML file that sync never writes to, regardless of what the spec says — left exactly as the user last edited it.
_Avoid_: Preserved field, protected field

**Sync**:
The one-way act of regenerating generated fields in an existing Bruno collection from the current OpenAPI spec, in place, leaving user-owned fields untouched. Has two modes: normal (default, respects all field ownership rules below) and overwrite mode.
_Avoid_: Import, convert (those imply first-time creation, not update-in-place)

**Adoption**:
Sync never guesses identity. A pre-existing hand-written file with no match key is invisible to sync — left untouched even if it describes the same operation as a spec entry, in which case sync creates a second, separate file rather than merge into the unrecognized one. No fuzzy matching by method+url.
_Avoid_: Migration, import-merge

**Overwrite mode**:
Sync run with `--overwrite`. Suspends every field-ownership rule in this document (seeded fields, per-key array diffing, orphan-preservation) and makes the spec win everywhere, unconditionally. An explicit escape hatch, not the default behavior.
_Avoid_: Force mode, clean sync

**Match key**:
The stable identifier used to pair an OpenAPI operation with an existing request file across sync runs, so a rename in either the spec or the file doesn't create a duplicate. Always the spec's `operationId` — required, must be unique; sync fails loud if missing or duplicated.
_Avoid_: Slug, request ID

**Sync state**:
The `operationId → file path` mapping that makes match keys work, persisted in a sidecar file this tool owns exclusively (`.bruno-openapi-sync/state.yml` at the collection root) — never written into request files themselves. Request/folder/environment YAML files carry no sync-specific fields; Bruno's app never sees or touches sync state. If the sidecar is lost, sync state is gone: existing synced files become indistinguishable from adopted hand-written files (see Adoption) and re-syncing creates duplicates rather than guessing at reconciliation — there is no fuzzy-rebuild fallback.
_Avoid_: Lockfile, manifest, match-key store

**Orphaned request**:
A request file whose match key no longer exists in the spec. If the file has no user-owned content, sync deletes it automatically. If it has any user-owned content, sync warns and skips deletion, leaving it for the user to remove by hand.
_Avoid_: Stale request, dangling request

**Folder placement**:
Which Bruno folder a request file lives in, derived from the first tag on its OpenAPI operation (untagged ops go to collection root). Placement is generated, not sticky — if an operation's first tag changes, the next sync moves the file to match.
_Avoid_: Tag mapping, category

**Generated URL**:
`http.url` is always generated as `{{baseUrl}}` + the spec's path template (e.g. `{{baseUrl}}/users/{id}`) — never an absolute URL. Regenerated every normal sync, no exceptions, so switching Bruno environments actually changes the target host.
_Avoid_: Endpoint URL, request URL

**Param/header entry**:
An entry in `http.params` or `http.headers`. Matched to the spec by name in normal sync mode: a name present in the spec gets its value/required/type regenerated; a name absent from the spec (user-added, e.g. a debug header) is left untouched; a spec entry missing from the file is appended. Overwrite mode replaces the whole array from the spec instead.
_Avoid_: Header field, param field

**Seeded field**:
A field that is user-owned like any other (sync never overwrites it on later runs) but gets a best-effort default written once, at file creation, derived from the spec. `http.auth` is the canonical example — seeded from the operation's security scheme on first creation, then permanently hands-off. Environment files (`environments/*.yml`) follow the same rule at the file level: generated once from the spec's `servers` array only if `environments/` is empty on first sync, never touched again. Request body (`http.body`) is also seeded: generated from the operation's schema on file creation, then fully user-owned in normal mode — a later spec schema change only triggers a CLI warning, it doesn't touch the file. `--overwrite` regenerates it. `info.seq` (Bruno's manual UI ordering number) is seeded too: assigned once on creation (next available slot), never recomputed in normal mode — new operations append at the end of the current order rather than being spliced into spec position.
_Avoid_: Default field, initial field
