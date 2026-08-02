# Contributing

## Reporting bugs & requesting features

- **Found a bug?** Open an issue using the [Bug report](.github/ISSUE_TEMPLATE/bug_report.yml) template. Include the command you ran, the spec (or a minimal excerpt), and your Node.js/tool version.
- **Have an idea?** Open an issue using the [Feature request](.github/ISSUE_TEMPLATE/feature_request.yml) template describing the problem before proposing a solution.
- Search existing issues first to avoid duplicates.

## Development environment

### Pre-requisites

- [Node.js](https://nodejs.org/) ≥ 22
- [pnpm](https://pnpm.io/) ≥ 11

### Setup

```bash
git clone https://github.com/brpaz/bruno-openapi-sync.git
cd bruno-openapi-sync
pnpm install
```

`pnpm install` also runs `lefthook install`, wiring up the git hooks below.

### Development loop

```bash
pnpm test        # vitest
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm format       # prettier --write
pnpm build        # tsdown -> dist/
```

Tests live in `test/`, fixture OpenAPI specs in `test/fixtures/specs/`. The whole tool is exercised through one library seam — `sync()` in `src/index.ts` — which the CLI and every test call directly.

### Git hooks

[Lefthook](https://github.com/evilmartians/lefthook) runs automatically:

- **pre-commit** — `eslint --fix` and `prettier --write` on staged files
- **commit-msg** — `commitlint`, enforcing [Conventional Commits](https://www.conventionalcommits.org/)

## Submitting changes

### Commit messages

Use Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, etc.) — commitlint rejects anything else.

### Pull requests

- Keep PRs focused on one change; split unrelated work into separate PRs.
- Make sure `pnpm test`, `pnpm typecheck`, and `pnpm lint` pass before opening.
- For a change to the field-ownership model (generated/seeded/user-owned) or other lasting design decisions, add an ADR under `docs/adr/` — see [`CONTEXT.md`](./CONTEXT.md) for the existing rationale.
