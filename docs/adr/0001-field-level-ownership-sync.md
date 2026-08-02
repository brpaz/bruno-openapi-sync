# Field-level ownership model for sync, with an overwrite escape hatch

Each Bruno request/environment file mixes spec-derived data (method, url, params) with user-owned data (scripts, auth, test bodies) in a single YAML file. We considered full regeneration on every sync (simple, but destroys manual edits) and a 3-way merge against a stored spec snapshot (safer but complex, needs baseline tracking). We chose a fixed allowlist of generated fields that sync always rewrites, a set of seeded fields written once at file creation and never again in normal mode, and everything else left untouched — with `--overwrite` as an explicit, unconditional escape hatch that suspends all of the above. This trades some rigidity (new field types require deliberately classifying them as generated/seeded/owned) for a strong guarantee: normal sync runs never silently destroy hand-written content, which is the property the whole tool exists to provide.

## Consequences

- Adding support for a new OpenAPI-derived field later requires an explicit classification decision (generated vs seeded vs never-touched), not just "wire it up."
- Orphaned requests with user content are never auto-deleted in normal mode — they accumulate until a human acts, which is a deliberate bias toward data safety over a tidy collection.
