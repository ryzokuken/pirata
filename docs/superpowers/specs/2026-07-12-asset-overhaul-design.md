# Pirata — Asset Overhaul Design

**Date:** 2026-07-12
**Status:** Approved by project owner (Ujjwal Sharma) after brainstorming session
**Scope:** Replace the v0 placeholder visuals — procedural tiles, rectangle
characters, unstyled UI — with real, freely licensed game art, without hurting
load or runtime performance. Extends the main design document's §4.6 (Assets
and maps); art direction (LPC 32px, Kenney/CC0 for gaps) is unchanged.

## 1. Goals and Non-Goals

**Goals:**

- Real LPC terrain replaces the three-color placeholder tileset, with visual
  variety: grass, cobble paths, building walls, dock planks, water with
  shoreline edges, and decorative props.
- Animated LPC characters replace the player and NPC rectangles: four-direction
  walk cycles, distinct looks for the player and each of the five base-pack
  NPCs (tavernkeeper, merchant, harbormaster, stevedore, watchwoman). World
  item pickups swap their gold circles for a tileset chest tile.
- The DOM UI (dialogue, clock, reputation, toasts) gets a coherent skin: CSS
  panels plus one pixel font.
- Every binary asset has an `ATTRIBUTION.md` row (CI-enforced, already wired),
  and a CI size budget guards performance.

**Non-goals:** audio, texture-atlas packing, additional maps, character
customization, and animations beyond walk/idle. Each is deferred until needed.

## 2. Asset Pipeline: Vendored, Direct-Load

Assets are generated once by committed scripts, checked in under
`packages/content/packs/base/assets/`, and loaded directly by Phaser — the
same regenerate-don't-hand-edit model as `pnpm build:maps`. Nothing runs at
build or load time, and the client fetches nothing from third-party hosts.
Two generation scripts own the pipeline:

- `scripts/build-tileset.ts` — downloads the LPC base assets zip (pinned URL,
  SHA-256 verified), extracts the source sheets, and packs the curated tiles
  into `tileset.png` per an in-script manifest that also exports the GID
  constants `build-town-map.ts` consumes.
- `scripts/compose-characters.ts` — sparse-clones the Universal LPC generator
  repo at a pinned commit, alpha-composites per-layer `walk.png` sheets
  (576×256, 9×4 frames of 64px) per character recipe, recolors garments and
  hair by palette-ramp substitution from the repo's `palette_definitions`,
  and emits each sheet's credits file from its `sheet_definitions` entries.

Both scripts need `pngjs` (pure-JS PNG codec) and `build-tileset.ts` needs
`fflate` (zip extraction); they are devDependencies used only by asset
generation, never shipped.

Alternatives considered and rejected:

- **Build-time atlas packing:** negligible win at one tileset plus five
  character sheets; permanent tooling cost. Revisit when asset count grows.
- **Runtime CDN fetch:** breaks offline development, bypasses the attribution
  discipline, and adds supply-chain risk.

### Sourcing and licensing

- **Terrain:** curated 32px tiles from the LPC base assets collection
  (CC-BY-SA 3.0 / GPL 3.0 dual license).
- **Characters:** six composite spritesheets built by `compose-characters.ts`
  from Universal LPC generator layers (CC-BY-SA 3.0 / GPL 3.0 per layer, some
  OGA-BY 3.0). Composite sheets have many authors, so each sheet gets a
  generated credits file committed alongside the PNG; the sheet's
  `ATTRIBUTION.md` row points to it. This satisfies CC-BY-SA attribution and
  the CI check.
- **Font:** Pixelify Sans (OFL 1.1, vendored from google/fonts) for headings,
  HUD, and toasts; dialogue body text stays `system-ui` for readability. The
  font file is a binary asset and gets an attribution row.

## 3. Content Schema

`pack.json` grows an `assets` section, validated by Zod:

- **tileset:** image path, tile width/height. The map's tileset reference
  resolves to this image instead of the runtime-generated placeholder.
- **characters:** spritesheet entries keyed by id — image path, frame size,
  and walk/idle animation metadata (rows, frame counts, frame rate).

NPC entries gain a `sprite` field referencing a character asset id; the player
sprite is declared in the pack's `assets` section. `pnpm validate:content`
gains an asset pass: sprite references resolve, and every referenced file
exists on disk.

**Core stays asset-blind.** Content exports an asset manifest consumed only by
the client; `WorldDef` and the simulation types do not change. The base game
remains an ordinary content pack — a third-party pack declares its art the
same way, and any expressiveness gap is a loader bug to fix.

## 4. Terrain and Map

`scripts/build-town-map.ts` remains the single source of truth for the town
map. Its legend expands from three tile kinds to the richer set above, and it
gains simple neighbor-aware autotiling for shoreline edges (logic lives in the
script, not the client). A new non-colliding `decor` tile layer places props
such as barrels and market stalls.

**Walkability is preserved exactly.** A golden test pins the collision grid:
the regenerated map must block and permit precisely the same tiles as the
current one. Visual variety is cosmetic; simulation behavior is untouched.

## 5. Characters and Animation (Client)

- Phaser already runs with `pixelArt: true`, which keeps 32px art crisp under
  the existing device-pixel-ratio zoom; the plan verifies rather than adds it.
- LPC sheets use 64×64 frames on the 32px grid. Sprites anchor with feet on
  their tile (origin ≈ (0.5, 0.75)) and depth-sort by y among themselves, so
  characters overlap each other correctly. Tile-versus-sprite occlusion
  (walking behind building walls) is out of scope; characters render above
  the tile layers as they do today.
- The existing move tweens drive animation: a walk cycle plays for the tween's
  duration, facing follows travel direction, and the sprite returns to its
  idle frame on arrival. NPC name labels stay as they are.

## 6. UI Skin

CSS only — no image-based panels. A dark-wood/parchment palette styles the
dialogue box, clock, reputation panel, and toasts; the pixel font loads via
`@font-face` with `font-display: swap`. Text contrast meets WCAG AA, and
`prefers-reduced-motion` disables toast and floating-text animation.

## 7. Performance Budget

- **Total binary assets ≤ 600KB.** `scripts/check-attribution.ts` grows a size
  check: it already walks every binary asset, so it also sums their sizes and
  fails CI over budget.
- Assets load once in the Phaser preloader and are cached by the browser
  thereafter. Sprite count is unchanged (five characters plus tilemap layers),
  so runtime cost does not change measurably.

## 8. Testing

- **Loader:** colocated unit tests for the new asset schema — valid packs
  parse, missing files and dangling sprite references fail with clear errors.
- **Map:** the collision-grid golden test from §4.
- **Content:** `pnpm validate:content` asset pass (schema, links, file
  existence).
- **E2E:** existing Playwright tests keep passing unchanged (they drive
  `window.__pirata`, not pixels); one new smoke assertion checks the console
  for Phaser loader errors.
- **Visual:** a screenshot in the PR description.

## 9. References

- LPC base assets: <https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles>
- Universal LPC character generator: <https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator>
- Main design document: `2026-07-05-pirata-design.md` (§4.6 Assets and maps)
