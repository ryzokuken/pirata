# ADR-0001: Web-native TypeScript stack

**Status:** Accepted 2026-07-05

## Decision

Pirata is a TypeScript monorepo: a pure headless simulation core, a Phaser 4
rendering shell, and Zod-validated JSON content packs. Maps are Tiled JSON.
Deployed to the web on every merge; desktop/mobile come later via PWA and
wrappers.

## Why not Godot?

Godot 4's web export is ~40 MB before game content and its editor-centric
workflow suits neither instant browser play, drive-by web contributors, nor
CLI-verifiable agent-driven development. A headless TS core is testable
end-to-end without a browser.

## Consequences

- Core must never import DOM/Phaser (enforced: its tsconfig has no DOM lib).
- All content loads through the same validated pack pipeline the base game
  uses.
- Full context in the design doc:
  `docs/superpowers/specs/2026-07-05-pirata-design.md`.
