# Contributing to Pirata

Pirata is built to be hacked on. Pick your on-ramp:

| I want to…                                          | Where                                                                        | Skills needed                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------- |
| Add/balance items, NPCs, factions, dialogue, rumors | `packages/content/packs/base/` (JSON)                                        | none — schemas validate your work |
| Make or edit maps                                   | `packages/content/packs/base/maps/` with [Tiled](https://www.mapeditor.org/) | Tiled only                        |
| Contribute art                                      | LPC style (32px top-down); add a row to `ATTRIBUTION.md`                     | pixel art                         |
| Change game rules                                   | `packages/core/` (pure TypeScript, fully unit-tested)                        | TypeScript                        |
| Improve rendering/UI                                | `packages/client/` (Phaser 4 + DOM)                                          | TypeScript/web                    |

## Ground rules

- Design doc: `docs/superpowers/specs/2026-07-05-pirata-design.md`; decisions
  live in `docs/adr/`.
- `pnpm install && pnpm --filter @pirata/client dev` gets you a running game.
- Before a PR: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
&& pnpm validate:content && pnpm check:attribution`.
- Formatting is enforced by oxfmt for code **and** markdown — if
  `format:check` complains, `pnpm format` fixes everything automatically.
- Code is GPLv3; original art contributions are CC-BY-SA 4.0 (CC0 welcome).
  Every asset needs an `ATTRIBUTION.md` row.
