# Pirata — Design Document

**Date:** 2026-07-05
**Status:** Approved by project owner (Ujjwal Sharma) after brainstorming session
**Scope:** Foundational architecture and v0 vertical slice for an open-source,
community-focused pirate RPG set in the golden age of piracy.

## 1. Vision

Pirata is a single-player, 2D top-down pirate RPG where exploration and freedom
are the spine of the experience. The player is a stranger in a living world of
factions and NPCs who remember what you do: reputation is earned per faction
and per NPC, crimes have witnesses and consequences that spread by gossip, and
the world opens up through rumors — bought, overheard, or coerced — rather than
quest markers.

The tone is realistic and gritty. The golden age of piracy was desperate, and
the game should feel it: supplies spoil, wounds fester, morale frays, and the
sea is dangerous. The default playstyle is the curious survivor — explore,
listen, sneak, scheme, and avoid open conflict. Getting into combat usually
means your plan already failed. Violence remains a real choice (factions and
players can embrace it), but the game's depth budget favors stealth, guile,
and survival over fighting.

The game is as much a community project as a game. Hacking on it is a virtue:
all content is data-driven and contributable without writing code, the source
is copyleft so forks stay in the commons, and every merge deploys a playable
build to the web. Development is iterative by construction — every milestone
ends playable and deployed, and every system starts as the simplest version
that is fun, then grows.

Inspirations: Pixel Dungeon (fork-friendly community), Dwarf Fortress and
Cataclysm: DDA (systemic depth, data-driven content), Sid Meier's Pirates!
(freedom on the account).

## 2. Decisions Summary

| Decision          | Choice                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Game shape        | Exploration-freedom RPG: factions, per-faction/per-NPC reputation, stealth, crime, rumor-driven exploration. Other systems start simple, iterate. |
| Default playstyle | Curiosity and conflict avoidance. Combat is a failure mode by default; violence stays available as a deliberate faction/player choice.            |
| Tone              | Realistic and gritty: spoiling supplies, festering wounds, fraying morale, survival pressure on voyages.                                          |
| Combat v1         | Simple turn-based party combat. Iterated on later like any other module — no special abstraction ceremony.                                        |
| Multiplayer       | None. Community lives in modding, forks, shared stories.                                                                                          |
| Platform          | Browser-first via web-native stack; desktop/mobile follow from PWA and wrappers.                                                                  |
| Stack             | TypeScript monorepo: pure headless simulation core + Phaser 4 client + JSON content packs.                                                        |
| Art               | 2D top-down pixel art, LPC asset family (32px), Kenney/CC0 for gaps.                                                                              |
| Maps              | Tiled, stored as JSON, consumed by both core (logic) and client (rendering).                                                                      |
| Modding model     | Data-driven content packs (CDDA model) + fork-friendly GPL code. No sandboxed scripting engine in v1.                                             |
| Licensing         | Code GPLv3; assets CC-BY-SA/GPL (LPC) and CC0/CC-BY per asset, tracked and CI-enforced.                                                           |
| v0 goal           | One-port vertical slice: arrive, socialize, transgress, follow a rumor, profit.                                                                   |

## 3. Principles

- **Iterate on playable software.** Every milestone ends deployed and playable
  in a browser. No milestone is "infrastructure only" except M0.
- **Simplest fun version first.** Every system ships minimal, then grows.
  Module boundaries — good engineering everywhere, not bespoke plugin systems —
  are what keep rewrites cheap.
- **Every tool must earn its place.** Adopt open tools that add real leverage
  (visual editing, accessibility, contributor reach); adopt nothing for its own
  sake.
- **The base game is a mod.** All base content loads through the same pipeline
  as third-party packs. Loader gaps are loader bugs, never special cases.
- **Fail fast, loudly, helpfully.** Content validation errors name the file,
  the field, and the likely fix.
- **Decisions in the open.** Design decisions get short ADRs in-repo so the
  community can see why, argue, and overturn.
- **Guardrails before code.** Linters, strict types, tests, CI, and content
  validation exist before game code, because agents write most of the code and
  automated verification is what makes that trustworthy.

## 4. Architecture

A pnpm monorepo with three layers. Dependencies point downward only.

```
┌────────────────────────────────────────────┐
│  @pirata/client      (Phaser 4 shell)      │  rendering, input, audio, UI
├────────────────────────────────────────────┤
│  @pirata/core        (pure TypeScript)     │  world state, systems, rules
├────────────────────────────────────────────┤
│  @pirata/content     (JSON packs + schemas)│  items, NPCs, factions, maps,
│                                            │  dialogue, rumors
└────────────────────────────────────────────┘
```

### 4.1 Core (`@pirata/core`)

Pure TypeScript, zero dependencies on Phaser or the DOM. Runs headlessly in
Node. Owns:

- **`GameState`** — fully serializable (save/load is `JSON.stringify`-shaped),
  producible from a seed + action log (deterministic replay).
- **Systems** — functions of the form `advance(state, intent) → { state,
events }`. Seeded RNG only; no ambient randomness, no wall-clock time.
- **Intents & events** — the client sends typed intents (move, talk, steal,
  attack); core returns state changes plus a typed event stream
  (`NpcWitnessedCrime`, `ReputationChanged`, `RumorHeard`) that the client
  renders and future mod hooks can subscribe to.

Entity model: plain typed entities and system functions. No ECS framework
unless profiling of real gameplay demands it (expected entity counts are in
the hundreds).

### 4.2 Time and world model

- **Time:** discrete ticks driven by player action (roguelike-style). The
  world responds when the player acts. Real-time feel (animation, ambience) is
  purely client-side.
- **World:** hierarchical — an overworld (post-v0) containing local maps
  (port towns, ship decks, wilderness). Local maps are Tiled tilemaps with
  object layers for spawns, triggers, and portals. v0 is one port town and
  surroundings.

### 4.3 The exploration-freedom systems

Each is an isolated core module with a typed interface.

**Factions and reputation.** Reputation is a ledger of deeds, not a single
number. Standing exists per faction and per NPC and is computed from what that
party knows. Knowledge propagates: a crime witnessed by a dockworker spreads
through their faction over in-game time (gossip), so consequences travel
realistically and evadably — silence the witness, bribe them, or leave before
word spreads. Deed types, standing effects, and propagation rules are content
data.

**Stealth and crime.** The primary verb set of the game, since the default
playstyle avoids violence. A visibility/awareness model (line of sight, light,
noise) underpins a growing vocabulary of actions: sneaking, eavesdropping,
pickpocketing, lockpicking, deception (lies, disguises, false flags), theft,
smuggling, sabotage, and more as the game grows. Crimes are data-defined
(act, witnesses, severity, which factions care), and coercion — intimidation,
bribery, blackmail — operates on the same NPC-knowledge substrate. Failure
states cascade before they explode: a botched pickpocket raises suspicion
before it draws steel, so recovery through talk, flight, or bribery is usually
possible — combat is what happens when every other option has been burned.

**Rumors and leads.** The quest system, inverted: no quest log, no markers.
Rumors are pieces of world knowledge (a wreck's location, a fat convoy, a
governor's secret) held by NPCs and extracted via reputation, coin, drink, or
coercion. A rumor points somewhere; following it makes the world generate the
payoff. Desperation pressure (hunger, debt, restless crew) pushes the player
toward chasing them. Rumor templates are content data.

**NPCs.** Need/goal-driven behavior — schedules, wants, fears — via simple
utility decisions, not scripted paths. Dialogue is data-driven trees whose
nodes carry conditions and effects hooking into reputation, rumors, and crime.

**Survival and hardship.** The gritty substrate that makes desperation real.
Player health is more than hit points: hunger, thirst, disease (scurvy on long
voyages), and untreated wounds degrade over time. Supplies have quality and
age — food spoils, water fouls, and provisioning decisions before a voyage
matter as much as anything during it. In v0 this appears as hunger and coin
pressure in the port; the full system arrives with sailing, where long or
difficult voyages become survival challenges in themselves. All thresholds,
afflictions, and spoilage rates are content data (tunable, moddable).

**Crew and morale (post-v0, designed for now).** Crew members are ordinary
NPCs — same needs, fears, and reputation model — on the player's side. Morale
is genuinely hard to manage: pay, food quality, danger, idle time, and the
captain's reputation all feed it, and low morale escalates from grumbling to
desertion to mutiny (a crime, on the same substrate, that NPCs can commit
too). Crew management thus emerges from existing systems rather than a bespoke
minigame.

**Combat (v1).** Simple turn-based party combat, resolved in its own module:
encounters produce casualties, loot, reputation deltas, captives. By design
combat is the failure mode of stealth and diplomacy, not the reward loop —
it should be survivable but costly (wounds that fester, reputations that
sour), so avoiding it feels like winning. Combat is iterated on later like
any other module.

### 4.4 Content (`@pirata/content`)

JSON content packs, borrowing Cataclysm-DDA's proven conventions and avoiding
its documented pitfalls:

- Every object has a `type` and a namespaced string id (`base:cutlass`,
  `mymod:kraken`). Core wraps ids in typed wrappers to prevent cross-type
  mixups.
- A pack is a directory with a `pack.json` manifest (name, version,
  dependencies, license, authors). File organization within a pack is
  convention, not requirement — a small mod can be one file.
- The base game ships as `packs/base/`, loaded like any other pack.
- Packs declare dependencies; later packs override or extend earlier objects
  by id with explicit semantics (`"extends"` / `"replaces"`) — no implicit
  inheritance surprises.
- **Validation:** Zod schemas are the source of truth, validating every object
  on load with precise, human-friendly errors (file, field, suggestion).
  Schemas export to JSON Schema so external editors give modders
  autocompletion and inline errors.
- **Finalization:** after all packs load, a link pass resolves every id
  reference and fails loudly on dangling ones.

**Data vs. code:** items, NPCs, factions, dialogue, rumor templates, crimes,
deeds and reputation rules, maps, spawn tables, and tuning constants are data.
Novel mechanics are code contributions to the GPL codebase — the second
modding surface. Dialogue/rumor hooks use a small vocabulary of
data-expressible conditions and effects (`reputation >=`, `has_item`,
`heard_rumor`, …) grown by demand; no sandboxed scripting engine in v1.

**Modder experience is a deliverable:** loading an extra pack is a dev-mode
URL parameter or drag-and-drop; `docs/modding/` is generated from the Zod
schemas so it cannot rot; a `pirata-lint` CLI validates packs outside the game
for use in modders' own CI.

### 4.5 Client (`@pirata/client`)

Phaser 4 + TypeScript + Vite. Contains no game rules.

- `WorldScene` renders the current local map and entities from core state;
  the event stream drives feedback (floating text, sound, shake).
- Game UI (dialogue, inventory, reputation, rumor journal) is DOM/HTML
  overlaid on the canvas — easier to contribute to, accessible (semantic
  markup, keyboard navigation, screen readers), and CSS-themeable.
- Targets: playable at a URL, hostable on GitHub Pages, PWA-installable for
  offline play. Responsive layout so mobile browsers work; touch input is a
  fast-follow, not a v0 gate.

### 4.6 Assets and maps

- **Art:** LPC asset family (32px top-down, internally consistent,
  CC-BY-SA 3.0 / GPL 3.0 — license-compatible with our copyleft stance);
  Kenney and other CC0 sources for UI, icons, and audio gaps. LPC style guide
  is the art contribution standard.
- **Attribution discipline:** machine-readable `ATTRIBUTION.md` mapping every
  asset to source, author, and license, enforced by a CI check from day one.
- **Maps:** authored in Tiled, stored as JSON in content packs. Layer
  conventions: `ground`, `walls`, `objects`, `overhead`, plus object layers
  for spawns/triggers/portals. Core consumes an engine-neutral parsed model
  (collision, triggers, spawns); the client renders the same file via
  Phaser's Tiled support. Map-making requires zero programming and is the
  most approachable non-coder contribution path.

## 5. Testing and Quality

The headless core is the testing strategy's foundation.

- **Core:** vitest unit tests per system, testing behavior (deed → gossip →
  reputation change observable in dialogue), not internals. Property-based
  tests (fast-check) for invariants: determinism (same seed + same intents ⇒
  identical state), serialization round-trips, reputation bounds.
- **Scenario harness:** a headless runner that scripts player intents against
  fixture worlds and asserts on resulting state/events. This is the primary
  verification tool for implementation agents ("stealing while observed makes
  the merchant guild hostile") and doubles as living documentation.
- **Content:** every pack validates in CI; the link pass runs on every PR.
- **Client:** kept thin so untested rendering code is low-risk; one Playwright
  smoke test boots the game and plays ~20 scripted intents.
- **Toolchain:** oxlint + oxfmt, `tsc --noEmit` with full strictness
  (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `noPropertyAccessFromIndexSignature`,
  `verbatimModuleSyntax`, `isolatedModules`), prek hooks, pinned dependencies,
  zero-warnings policy. CI on every PR: lint, typecheck, tests, content
  validation, attribution check.

## 6. Community Model and Workflow

- **Repo:** single public GitHub repository — code (GPLv3), base content
  pack, assets (per-asset CC licenses), docs. `CONTRIBUTING.md` with distinct
  on-ramps: content (JSON, no code), maps (Tiled, no code), art (LPC style
  guide), code. Good-first-issue discipline; GitHub Discussions for design.
- **ADRs:** short architecture decision records in-repo for every
  game-shaping decision.
- **Releases:** every merge to main auto-deploys the playable build to GitHub
  Pages; tagged releases with changelogs at milestones. PR reviews include a
  playable preview.
- **Agent-driven development:** the implementation plan decomposes work into
  self-contained tasks with interface contracts, test expectations, and
  verification commands, executable by subagents in isolated worktrees. The
  guardrail stack is built in M0, before game code.

## 7. Roadmap

Each milestone ends playable and deployed.

- **M0 — Skeleton.** Monorepo, toolchain, CI, GitHub Pages deploy, empty
  Phaser canvas at a URL. Proves the factory works.
- **M1 — A walkable world.** One Tiled port town renders; the player walks
  with collision; core/client boundary functioning; save/load.
- **M2 — A social world.** NPCs with schedules; data-driven dialogue;
  per-NPC/faction reputation ledger visibly reacting to the player.
- **M3 — A lawless world.** Stealth/awareness, a first verb set (sneaking,
  eavesdropping, pickpocketing, lockpicking, theft) with witnesses, gossip
  propagation, consequences (prices, guards, dialogue). The crime loop closes.
- **M4 — A storied world (v0 complete).** Rumors extractable from NPCs; one
  rumor leads out of town to a payoff guarded by an encounter that stealth or
  guile can bypass entirely — and a simple turn-based fight resolves it when
  the plan fails; desperation pressure (hunger, coin). **Success criterion: a
  stranger arrives, learns, schemes, transgresses, and profits — in one port
  town, ideally without drawing a blade.**
- **Beyond v0 (direction, not commitment):** sailing and an archipelago
  overworld, voyage survival (provisioning, spoilage, disease), crew and
  morale management, economy and trade, richer combat — each built as the
  simplest fun version first, then iterated.

## 8. Licensing

- **Code:** GPLv3 — forks stay open, keeping community work in the commons
  (the Pixel Dungeon model).
- **Assets:** per-asset licenses tracked in `ATTRIBUTION.md`; LPC assets under
  their CC-BY-SA 3.0 / GPL 3.0 dual license, new original assets contributed
  under CC-BY-SA 4.0, CC0 assets welcome.
- **Content packs:** base pack CC-BY-SA 4.0; third-party packs choose their
  own license via `pack.json`.

## 9. References

- Godot 4 web export state (rejected: ~40 MB baseline, editor-centric,
  weaker agent ergonomics): [Godot forum on 4.3 web builds](https://forum.godotengine.org/t/godot-4-3-will-finally-fix-web-builds-no-sharedarraybuffers-required/38885),
  [export size issue](https://github.com/godotengine/godot/issues/68647)
- Phaser 4 (stable April 2026): [Phaser vs PixiJS comparison](https://generalistprogrammer.com/comparisons/phaser-vs-pixijs)
- Cataclysm-DDA modding architecture: [modding framework](https://deepwiki.com/CleverRaven/Cataclysm-DDA/1.3-modding-framework),
  [JSON_INFO](https://docs.cataclysmdda.org/JSON/JSON_INFO.html),
  [JSON inheritance pitfalls](https://docs.cataclysmdda.org/JSON/JSON_INHERITANCE.html)
- LPC assets: [base assets](https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles),
  [Universal LPC character generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator)
- Tiled map editor: [mapeditor.org](https://www.mapeditor.org/)
