# Pirata — agent guide

Open-source pirate RPG. Spec: `docs/superpowers/specs/2026-07-05-pirata-design.md`.
Plans: `docs/superpowers/plans/` (one per milestone; keep the plan in sync when
execution deviates — it's the record the next milestone builds on).
Live build: <https://www.ryzokuken.dev/pirata/> (deployed from `main` via Pages).

## Architecture (enforced, don't fight it)

- Three layers, dependencies point down only: `@pirata/client` (Phaser 4 + Vite)
  → `@pirata/core` (pure simulation) → `@pirata/content` (JSON packs + Zod).
- `packages/core` has **no DOM lib and zero runtime deps** — its tsconfig
  enforces this; never add either. All game rules live here, deterministic,
  serializable, seeded RNG only (no `Date.now`/`Math.random` in core logic).
- The base game is an ordinary content pack (`packages/content/packs/base/`);
  if the loader can't express something base needs, fix the loader.
- Client contains no game rules: it sends intents to `advance()` and renders
  state/events. `window.__pirata` (getState/dispatch) is the debug hook the
  e2e tests drive — keep it working.

## Commands

- `pnpm dev` — hot-reloading dev server (client + core + content changes).
- Full gate (green before every commit):
  `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
- `pnpm test:e2e` — builds client, runs Playwright smoke tests.
- `pnpm validate:content` — validates packs (schema, links, asset files);
  `pnpm check:attribution` — every binary asset needs an ATTRIBUTION.md row and
  the total must stay ≤ 600KB (CI enforces both).
- `pnpm build:maps` — regenerates both map JSONs from the ASCII layouts in
  `scripts/map-defs.ts`; `pnpm build:tileset` / `pnpm build:characters`
  regenerate the committed PNGs from pinned upstream sources (cached in
  `.cache/`). Regenerate, don't hand-edit generated files.
- `pnpm format` fixes formatting; oxfmt formats **markdown too** by policy.
- Workflows: `actionlint .github/workflows/` and `zizmor .github/workflows/`
  must stay clean (`prek` and `zizmor` may live in `~/.cargo/bin/`).

## Conventions & gotchas (learned the hard way)

- Relative imports use explicit `.ts` extensions; scripts run with plain
  `node script.ts` (Node 24 type stripping, `erasableSyntaxOnly`) — no tsx.
- Use **named imports** from `phaser` and `fast-check`; default-import plus
  member access (`Phaser.Scene`, `fc.assert`) fails oxlint
  `no-named-as-default-member` because both ship real named ESM exports.
- Tests are colocated `src/*.test.ts`, run by root vitest. TDD: failing test
  first, verify it fails for the right reason. For algorithm-critical code add
  golden-value tests and mutation-check them (break the code, confirm the test
  fails) — range/determinism assertions alone won't catch constant drift.
- The RNG golden-sequence test pins save compatibility: changing `rng.ts`
  constants breaks every existing save. Don't, without a `SAVE_VERSION` bump.
- Keep `@types/node` on the same major as `.node-version` (24) — CI runs 24.
- GitHub Actions are SHA-pinned with version comments; resolve SHAs live via
  `gh api repos/<a>/git/ref/tags/<tag>` (dereference annotated tags), never
  from memory. Deploy does NOT gate on CI — branch protection on `main` with
  the `checks` job required is what guarantees deployed code passed.
- Pin dependency versions exactly (`pnpm add -E`); never write versions from
  memory — let the resolver pick current stable.
- Zero warnings from every tool. If a lint rule fights a deliberate design
  (e.g. `window.__pirata` vs `no-underscore-dangle`), use the narrowest scoped
  disable with a justification comment — never a project-wide rule change.
- Content JSON is imported with `with { type: "json" }` attributes so the same
  modules load under Node, Vite, and vitest; content ships as data files in
  `packages/content/packs/base/` validated by `pnpm validate:content` (schema +
  link pass + spawn smoke).
- Commits: imperative, ≤72-char subject, one logical change, trailer
  `Co-Authored-By: Claude <noreply@anthropic.com>`. Push feature branches and
  open PRs (no YubiKey needed for this repo — standing exception). Never push
  or commit to `main`.
