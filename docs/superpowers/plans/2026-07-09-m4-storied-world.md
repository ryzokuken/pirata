# Pirata M4: A Storied World Implementation Plan (v0 complete)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close v0: a rumor bought or earned in the tavern points to the smugglers' cove north of town; the player travels there through the game's first map transition, and either times a tide-tunnel heist past the guards' patrols or fights a turn-based battle when the plan fails; hunger and coin pressure push them to act; fencing the treasure back in town completes the spec's success criterion — _a stranger arrives, learns, schemes, transgresses, and profits, ideally without drawing a blade._

**Architecture:** The world becomes multi-map: `WorldDef.maps` + portal tiles, NPCs pinned to their map, awareness/gossip filtered per map. Combat is a new pure core module (`combat.ts`) with explicit encounter state and D&D-shaped mechanics (d20 to-hit vs armor class, damage dice, opportunity attacks on flee) — deliberately structured so future party combat and a detailed inventory can grow into it (owner direction, 2026-07-09). Hostile NPCs aggro through the existing awareness model and chase via the existing BFS, so stealth bypass falls out of systems M3 already built. Rumors are content objects granted by a new dialogue effect. Hunger is a slow clock on the player that food items reset. Defeat is robbed-not-dead. Spec: `docs/superpowers/specs/2026-07-05-pirata-design.md` (§4.3 rumors/leads, survival; §7 M4).

**Tech Stack:** Unchanged. **No new dependencies.**

**Prerequisite:** PR #5 (`feat/town-map-overhaul`) merged — this plan builds on the 36×24 town, camera follow, and the reachability link pass.

---

## Execution ground rules

- Branch `feat/m4-storied-world` from up-to-date `origin/main`. Never commit or push to `main` (protected: `checks` + `e2e` required).
- Pushing needs no YubiKey (standing exception). Push the feature branch, open a PR at the end.
- **Standard task footer** (applies to EVERY task; not restated below): tick each completed plan checkbox `- [x]`; run `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` (zero warnings; `pnpm format` first if formatting complains); commit imperative ≤72-char subject with trailer `Co-Authored-By: Claude <noreply@anthropic.com>`; do not push mid-plan. TDD: failing test first, verify the failure reason, implement, verify pass. New `GameEvent` members must be added to the client's exhaustive `renderEvent` switch as no-op cases in the same task (Task 13 makes them real). New public core names are exported from `packages/core/src/index.ts` in the same task.
- The RNG golden-sequence test must NOT change. `pnpm test:e2e` must be green at Task 14 and before the PR.
- If the spec contradicts the real code (or a golden value computes differently), the implementer reports NEEDS_CONTEXT with specifics instead of improvising.

## Design decisions (why the code below looks the way it does)

- **Multi-map, minimally.** `WorldDef.map` becomes `maps: Record<id, MapModel>` + `startMapId`. `currentMap(state, world)` is the one accessor everything uses. NPCs carry `mapId` (content field `map`, defaulting to the start map); movement, awareness, witnesses, gossip, confrontation, and aggro all filter to a single map. NPCs never cross maps in v0.
- **Portals are map data.** A `portals` object layer in Tiled; object name `"<toMapId>/<toLocationName>"` at a walkable tile. Walking onto a portal tile transitions: `mapId` switches, the player lands on the named location of the target map, the tick advances as a normal move. If an NPC occupies the arrival tile, the move is `movement-blocked` (deterministic, no overlap). The link pass resolves portal targets and extends reachability: each map must have every scheduled location, placed item, and portal tile reachable from that map's _entry points_ (the start map's spawn; other maps' portal-arrival locations).
- **Rumors are knowledge, not quests** (spec §4.3: no quest log, no markers). `RumorDef {id, text}`; a new dialogue effect `{type:"rumor", rumorId}` appends to `state.rumors` (idempotent). The cove exists whether or not you've heard of it — the rumor tells you it's worth visiting and _when the inside guard drinks at the mouth_ (the timing hint that makes the clean heist plannable). Two extraction paths in content: pay the tavernkeeper coin, or earn it free from the harbormaster at high dockworker standing.
- **Combat is an encounter mode, D&D-shaped.** `state.combat: {enemyIds} | null`, entered when an _alerted_ hostile becomes adjacent. Stats live in `CombatantDef {maxHp, attackBonus, armorClass, damage: {count, sides, bonus}}` — on `NpcDef.combat` for NPCs, and a `PLAYER_COMBAT` core constant for the player (content-driven when a character system exists). Rounds: one player combat intent (`attack {index}` | `flee {direction}`), then every living enemy acts (adjacent → attack roll; else → one BFS step toward the player). To-hit: `d20 + attackBonus ≥ armorClass`. All rolls thread `state.rng`. Combat rounds do NOT advance the world tick (a fight is seconds, not minutes; the rest of the world holds its breath — revisit when crew exists). Flee is D&D-flavored: adjacent enemies take opportunity attacks first, then the player steps; if the step was blocked the round is wasted; if afterwards no enemy is within `DISENGAGE_RANGE` (2), combat ends `"fled"` — the enemies stay alerted and keep chasing on the map, so re-engagement is possible.
- **Aggro rides the awareness model.** Each tick, hostile NPCs on the player's map that can see the player (same radius/LOS as witnesses — sneak and night genuinely help) become `alert`. Alerted hostiles abandon their schedule and chase (BFS step toward the player). Alert clears when the player is farther than `CHASE_RANGE` (10) or leaves the map. Combat starts when an alerted hostile is adjacent after NPC movement.
- **Death of an NPC** removes it from `state.npcs`, drops its pockets onto its tile as world items, and ends its schedule forever (persistent consequence). Killing is NOT yet a crime — there are no witnesses in the cove and murder-as-deed lands with M5's law depth; recorded as deferred.
- **Defeat is robbed-not-dead** (owner decision): player hp ≤ 0 → wake at the start map's spawn with `coin 0`, `items []`, hp restored to max, combat cleared, sneaking off; enemies keep their wounds and lose alert. No deed, no game over.
- **Hunger is a slow clock.** `player.hunger` +1 every `TICKS_PER_HUNGER` (10 ticks = 1 in-game hour), clamped at `HUNGER_MAX` (30). Stages: fed < 12 ≤ hungry < 24 ≤ starving. While starving, each hunger increment also costs 1 hp — but hp never drops below 1 from hunger (you can't starve to death in v0; combat is the only killer — recorded as a deliberate cap). `eat {index}` consumes a carried item with a `food` def (`ItemDef.food?: {nutrition}`), reduces hunger, costs 1 tick. Dried fish becomes food (nutrition 8), rum too (nutrition 2). `hunger-changed {stage}` fires only on stage transitions.
- **The cove is the second generated map.** `scripts/build-town-map.ts` becomes `scripts/build-maps.ts`, emitting both maps from two ASCII layouts (`pnpm build:maps` unchanged as a command). The cove's geometry encodes the encounter design: a guarded mouth, a treasure chamber, and a west tide-tunnel whose chamber entrance sits outside the inside guard's perception radius — but the treasure itself is beside his post, so the heist only works while his schedule has him drinking at the mouth (12:00–23:00), exactly as the rumor hints. At night the town-to-cove walk is also stealthier (radius 2). Getting greedy at the wrong hour means aggro, chase, and the fight.
- **Save:** `SAVE_VERSION = 5` (v4 shipped in the map overhaul? No — the map overhaul didn't change GameState; M3's v3 is current. M4 bumps to **4**). All new player/npc/state fields land in one shape task (Task 2), one bump.
- **Victory beat:** selling any item with `treasure: true` (new optional `ItemDef` flag) emits `fortune-made` once (tracked via `state.flags.fortuneMade`); the client shows a banner. v0's success criterion, made visible.

## File structure

```
pirata/
├── docs/adr/0004-many-maps-rumors-and-steel.md    # new ADR (Task 15)
├── scripts/build-maps.ts                          # renamed from build-town-map.ts; two layouts
├── e2e/
│   ├── crime.spec.ts                              # MODIFY only if assertions drift
│   └── storied.spec.ts                            # new
└── packages/
    ├── core/src/
    │   ├── map.ts             # MODIFY: portals object layer
    │   ├── defs.ts            # MODIFY: maps/startMapId, NpcDef mapId/combat/hostile,
    │   │                      #   ItemDef food/treasure, RumorDef, CombatantDef, rumor effect
    │   ├── state.ts           # MODIFY: hp/hunger/rumors/combat/flags, npc mapId/hp/alert,
    │   │                      #   currentMap, PLAYER_COMBAT; multi-map createGameState
    │   ├── save.ts            # MODIFY: SAVE_VERSION = 4
    │   ├── npc.ts             # MODIFY: per-map advance, chase targets
    │   ├── awareness.ts       # MODIFY: witnesses filters by map
    │   ├── gossip.ts          # MODIFY: same-map pairs only
    │   ├── hunger.ts          # new: accrual + stages
    │   ├── rumor.ts           # (folded into advance; no module needed)
    │   ├── combat.ts          # new: rolls, rounds
    │   ├── intent.ts          # MODIFY: attack/flee/eat
    │   ├── event.ts           # MODIFY: new members
    │   ├── advance.ts         # MODIFY: transitions, aggro, combat mode, hunger, rumor effect
    │   ├── world.fixture.ts   # MODIFY: second map + hostile brute + rumor + food
    │   └── index.ts           # MODIFY
    ├── content/
    │   ├── src/schemas.ts     # MODIFY: rumor object, npc map/combat/hostile, item food/treasure
    │   ├── src/finalize.ts    # MODIFY: maps record, portals, per-map reachability, rumor links
    │   ├── src/base.ts        # MODIFY: two maps, rumors.json
    │   └── packs/base/
    │       ├── pack.json      # 0.4.0
    │       ├── rumors.json    # new
    │       ├── items.json     # MODIFY: food/treasure fields + pearl_strand
    │       ├── factions.json  # MODIFY: smugglers
    │       ├── npcs.json      # MODIFY: two smugglers (cove, hostile, combat)
    │       ├── dialogues.json # MODIFY: rumor extraction choices
    │       └── maps/{port_town,smugglers_cove}.map.json  # regenerated
    └── client/
        ├── index.html         # MODIFY: HP/hunger HUD, journal, combat panel, banner
        └── src/{ui.ts,world-scene.ts}  # MODIFY: map switch, combat UI, eat buttons, keys
```

---

## Task 1: Core — portals in the map model + multi-map defs

**Files:** modify `packages/core/src/map.ts`, `packages/core/src/map.test.ts`, `packages/core/src/defs.ts`, `packages/core/src/world.fixture.ts`, `packages/core/src/index.ts`

- [x] **Step 1: Failing map tests** — add a `portals` layer to `tiledFixture()`:

```ts
      {
        name: "portals",
        type: "objectgroup",
        objects: [{ name: "other/arrival", x: 32, y: 32 }],
      },
```

and tests: parses `map.portals` to `[{ at: { x: 1, y: 1 }, toMapId: "other", toLocation: "arrival" }]`; absent layer → `[]`; a portal on a blocked tile throws (`not on walkable ground`, matching the items convention); a portal name without `/` throws `map "test": portal "bad" must be named "<mapId>/<location>"`.

- [x] **Step 2: Implement** in `map.ts`:

```ts
export interface MapPortal {
  readonly at: Vec2;
  readonly toMapId: string;
  readonly toLocation: string;
}
```

`MapModel` gains `readonly portals: readonly MapPortal[];`. Parse loop mirrors the items loop (walkability + bounds check); split the object name on the first `/`; both halves must be non-empty.

- [x] **Step 3: Multi-map defs** in `defs.ts`:

```ts
export interface DamageDie {
  readonly count: number;
  readonly sides: number;
  readonly bonus: number;
}

export interface CombatantDef {
  readonly maxHp: number;
  readonly attackBonus: number;
  readonly armorClass: number;
  readonly damage: DamageDie;
}

export interface RumorDef {
  readonly id: string;
  readonly text: string;
}
```

`NpcDef` gains `readonly mapId: string;`, `readonly combat?: CombatantDef;`, `readonly hostile?: boolean;`. `ItemDef` gains `readonly food?: { readonly nutrition: number };` and `readonly treasure?: boolean;`. `DialogueEffect` union gains `| { readonly type: "rumor"; readonly rumorId: string }`. `WorldDef`: replace `map: MapModel` with `readonly maps: Readonly<Record<string, MapModel>>;` and `readonly startMapId: string;`, and add `readonly rumors: Readonly<Record<string, RumorDef>>;`.

- [x] **Step 4: Compile fallout, mechanically.** `mapFromAscii` gains `portals: []` in its return. `fixtureWorld()` temporarily: `maps: { fixture: FIXTURE_MAP }, startMapId: "fixture", rumors: {}`, `mapId: "fixture"` on every NPC (Task 2 rebuilds it properly). Everywhere `world.map` is referenced (`advance.ts`, `npc.ts`, `state.ts`, `dialogue.ts` — grep `world.map`), substitute `world.maps[state.mapId]!`-style access ONLY as a compile stopgap where a state is in scope; where none is (content `finalize.ts`, client), stub per Task 11/13 notes: finalize returns `maps: { [map.id]: map }, startMapId: map.id, rumors: {}` (its signature still takes one map until Task 11); the client uses `world.maps[world.startMapId]` via a small `startMap(world)` local. Prefer introducing `currentMap(state, world)` in Task 2 — if the stopgaps get ugly, do the minimal thing that compiles and leave a `// Task 2 replaces` comment.

## Task 2: Core — GameState v4 (hp, hunger, rumors, combat, flags, per-map NPCs) + fixture v4

**Files:** modify `packages/core/src/state.ts`, `save.ts`, `world.fixture.ts`; tests `state.test.ts`, `save.test.ts`

- [x] **Step 1: Rebuild the fixture** — `world.fixture.ts` gets a second map and a hostile brute. Keep the existing `FIXTURE_MAP` town rows exactly; add a 7×5 lair — loot `9` at (2,1), brute post `x` at (3,1), arrival location `o` at (3,3):

```ts
export const LAIR_MAP: MapModel = {
  ...mapFromAscii(["#######", "#.9x..#", "#.....#", "#..o..#", "#######"], {
    "9": "test:loot",
  }),
  id: "lair",
};
```

(`mapFromAscii` treats lowercase letters as locations, so `x` and `o` come out as location names automatically.) Then wire portals by spreading:

```ts
export const FIXTURE_TOWN: MapModel = {
  ...FIXTURE_MAP,
  id: "town",
  portals: [{ at: { x: 6, y: 3 }, toMapId: "lair", toLocation: "o" }],
};
```

(Tile (6,3) is the open east end of the town's row 3 — currently walkable, no location on it.) And `LAIR_MAP` gains `portals: [{ at: { x: 5, y: 3 }, toMapId: "town", toLocation: "b" }]` ((5,3) is open floor; `b` is the town location at (1,3)). `fixtureWorld()` returns `maps: { town: FIXTURE_TOWN, lair: LAIR_MAP }, startMapId: "town"`; all existing NPCs get `mapId: "town"`; new NPC:

```ts
      "test:brute": {
        id: "test:brute",
        name: "Brute",
        factionId: "test:watch",
        dialogueId: "test:walker_talk",
        mapId: "lair",
        schedule: [{ hour: 0, location: "x" }],
        pockets: ["test:trinket"],
        hostile: true,
        combat: { maxHp: 6, attackBonus: 2, armorClass: 10, damage: { count: 1, sides: 4, bonus: 0 } },
      },
```

items: `test:loot` `{ id, name: "Loot", value: 40, treasure: true }` added; `test:trinket` gains `food: { nutrition: 8 }` (double-duty test food); rumors: `"test:whisper": { id: "test:whisper", text: "There is loot in the lair." }`.

- [x] **Step 2: Failing state/save tests.** `state.test.ts` additions: fresh state has `player.hp === PLAYER_COMBAT.maxHp`, `player.hunger === 0`, `rumors: []`, `combat: null`, `flags: { fortuneMade: false }`; NPCs carry `mapId` and combat-capable NPCs carry `hp` (`test:brute` → `hp: 6`, non-combat NPCs have NO `hp` key) and no `alert` key; `worldItems` seed from ALL maps with their `mapId` (`{ mapId: "lair", itemId: "test:loot", pos: {x:2,y:1} }` present alongside the town trinket); NPCs spawn on their own map (brute at (3,1) — no collision with town NPCs at the same coordinates on a different map). `save.test.ts`: round-trip a state carrying combat/rumors/hunger; reject version 3.

- [x] **Step 3: Implement `state.ts`.**

```ts
export const PLAYER_COMBAT: CombatantDef = {
  maxHp: 12,
  attackBonus: 3,
  armorClass: 12,
  damage: { count: 1, sides: 6, bonus: 1 },
};

export interface PlayerState {
  readonly pos: Vec2;
  readonly coin: number;
  readonly items: readonly string[];
  readonly sneaking: boolean;
  readonly hp: number;
  readonly hunger: number;
}

export interface NpcState {
  readonly id: string;
  readonly mapId: string;
  readonly pos: Vec2;
  readonly pockets: readonly string[];
  readonly hp?: number;
  readonly alert?: boolean;
}

export interface WorldItem {
  readonly mapId: string;
  readonly itemId: string;
  readonly pos: Vec2;
}

export interface CombatState {
  readonly enemyIds: readonly string[];
}

export interface GameFlags {
  readonly fortuneMade: boolean;
}
```

`GameState` gains `readonly combat: CombatState | null;`, `readonly rumors: readonly string[];`, `readonly flags: GameFlags;`. `createGameState`: spawn NPCs per their own map's locations (occupancy keyed by `mapId:x,y`; the player only occupies the start map); `worldItems` = every map's items tagged with that `mapId`; `mapId: world.startMapId`; `player.pos` = start map's `playerSpawn`. Add and export:

```ts
export function currentMap(state: GameState, world: WorldDef): MapModel {
  const map = world.maps[state.mapId];
  if (map === undefined) {
    throw new Error(`state references unknown map "${state.mapId}"`);
  }
  return map;
}
```

`save.ts`: `SAVE_VERSION = 4`. Fix all Task 1 stopgaps to use `currentMap`. `exactOptionalPropertyTypes`: omit `hp`/`alert` keys when absent (conditional spread).

## Task 3: Core — per-map simulation (movement, witnesses, gossip, confrontation)

**Files:** modify `packages/core/src/npc.ts`, `awareness.ts`, `gossip.ts`, `advance.ts`; tests `npc.test.ts`, `awareness.test.ts`, `gossip.test.ts`, `advance.test.ts`

- [ ] **Step 1: Failing tests.** `npc.test.ts`: the brute (lair) advances toward its post using the LAIR map while town NPCs use the town map — assert one tick of `advanceNpcs` moves a lair NPC legally on its own geometry, and that a town NPC and lair NPC may occupy equal coordinates without blocking each other. `awareness.test.ts`: `witnesses` returns only NPCs whose `mapId` equals the player's current map (brute adjacent-by-coordinates on the other map is NOT a witness). `gossip.test.ts`: NPC pairs on different maps never share knowledge even at distance 0. `advance.test.ts`: the guard-confrontation check ignores confronters on other maps (manufacture a state with the guard's `mapId` changed).

- [ ] **Step 2: Implement.** `advanceNpcs` signature becomes `{ npcs, playerPos, playerMapId, world, tick }`: each NPC resolves ITS map via `world.maps[npc.mapId]`, occupancy sets are per map (`` `${npc.mapId}:${x},${y}` ``), and the player tile only occupies `playerMapId`. `witnesses(state, world, at)` uses `currentMap(state, world)` for LOS and skips NPCs with `npc.mapId !== state.mapId`. `spreadGossip` takes `{ deeds, npcs, world }` (it needs per-map LOS): pairs require `a.mapId === b.mapId`, LOS on `world.maps[a.mapId]`. `findConfronter` skips other-map NPCs. `applyTick` passes the new arguments and uses `currentMap` for the player-move blocking checks in `applyMove`/`applyTake` etc.

## Task 4: Core — portal transitions

**Files:** modify `packages/core/src/advance.ts`, `event.ts`; test `advance.test.ts`

- [ ] **Step 1: Failing tests** (fixture: town portal at (6,3) → lair `o` (3,3); lair portal (5,3) → town `b` (1,3)):

```ts
describe("advance: portals", () => {
  // Player (1,1) → (6,3): S,S,E,E,E,E,E — the last east step lands on the portal.
  const WALK_TO_PORTAL: readonly Intent[] = [
    { type: "move", direction: "south" },
    { type: "move", direction: "south" },
    ...Array.from({ length: 5 }, (): Intent => ({ type: "move", direction: "east" })),
  ];

  it("stepping onto a portal moves the player to the target map location", () => {
    const result = run(freshState(), WALK_TO_PORTAL);
    expect(result.mapId).toBe("lair");
    expect(result.player.pos).toEqual({ x: 3, y: 3 });
  });

  it("emits map-changed and still costs a tick", () => {
    const before = run(freshState(), WALK_TO_PORTAL.slice(0, -1));
    const result = advance(before, { type: "move", direction: "east" }, world);
    expect(result.events).toContainEqual({
      type: "map-changed",
      fromMapId: "town",
      toMapId: "lair",
      at: { x: 3, y: 3 },
    });
    expect(result.state.tick).toBe(before.tick + 1);
  });

  it("keeps working in both directions", () => {
    const inLair = run(freshState(), WALK_TO_PORTAL);
    // (3,3) → portal (5,3): E,E
    const back = run(inLair, [
      { type: "move", direction: "east" },
      { type: "move", direction: "east" },
    ]);
    expect(back.mapId).toBe("town");
    expect(back.player.pos).toEqual({ x: 1, y: 3 });
  });

  it("is blocked when an NPC stands on the arrival tile", () => {
    const before = run(freshState(), WALK_TO_PORTAL.slice(0, -1));
    const blocked = {
      ...before,
      npcs: before.npcs.map((npc) =>
        npc.id === "test:brute" ? { ...npc, pos: { x: 3, y: 3 } } : npc,
      ),
    };
    const result = advance(blocked, { type: "move", direction: "east" }, world);
    expect(result.state.mapId).toBe("town");
    expect(result.events[0]?.type).toBe("movement-blocked");
  });
});
```

(Fixture geometry note: `WALK_TO_PORTAL`'s south-south takes the player to (1,3)=`b`, then five easts along the open row 3 — (2,3),(3,3) the trinket tile,(4,3),(5,3),(6,3) — the trinket underfoot is irrelevant to movement.)

- [ ] **Step 2: Implement.** `event.ts`: `MapChangedEvent { type: "map-changed"; fromMapId; toMapId; at: Vec2 }`. In `applyMove`, after computing an unblocked `to` on the current map: look up `currentMap(state,world).portals.find(at === to)`; if found, resolve the target map + location, check no same-map NPC occupies the arrival tile (else `movement-blocked` as usual, tick still passes); on success the tick applies with the player's NEW map/pos (`applyTick` needs the player's `mapId` — pass `playerMapId` through so NPC blocking and aggro use the arrival map) and events `player-moved` (from → portal tile) + `map-changed`. Update `applyTick`'s signature once: `applyTick(state, playerPos, events, world, options?: { ticks?: number; playerMapId?: string })` — 5 params, options object; all callers updated (sneak's double tick becomes `{ ticks: 2 }`).

## Task 5: Core — rumors

**Files:** modify `packages/core/src/advance.ts`, `event.ts`; tests `advance.test.ts`, `dialogue.test.ts` (none needed — no condition change)

- [ ] **Step 1: Failing tests.** Extend the fixture keeper dialogue: add a choice `{ text: "Any whispers?", effects: [{ type: "rumor", rumorId: "test:whisper" }] }` to the `hello` node. Tests: choosing it appends `"test:whisper"` to `state.rumors` and emits `{ type: "rumor-heard", rumorId: "test:whisper" }`; choosing it twice does not duplicate the entry and the second time emits nothing.

- [ ] **Step 2: Implement.** `event.ts`: `RumorHeardEvent { type: "rumor-heard"; rumorId }`. In `applyChoose`'s effect loop: `rumor` effects append if `!state.rumors.includes(rumorId)` (else no-op, no event). Rumor granting is instantaneous (dialogue-time, no tick) like deeds.

## Task 6: Core — hunger and eating

**Files:** create `packages/core/src/hunger.ts` + `hunger.test.ts`; modify `advance.ts`, `intent.ts`, `event.ts`; test `advance.test.ts`

- [ ] **Step 1: Failing unit tests** — `hunger.test.ts` (golden values):

```ts
import { describe, expect, it } from "vitest";
import { HUNGER_MAX, HUNGRY_AT, hungerStage, STARVING_AT, TICKS_PER_HUNGER } from "./hunger.ts";

describe("hunger stages (golden)", () => {
  it("pins the constants", () => {
    expect(TICKS_PER_HUNGER).toBe(10);
    expect(HUNGRY_AT).toBe(12);
    expect(STARVING_AT).toBe(24);
    expect(HUNGER_MAX).toBe(30);
  });

  it("maps hunger to stages", () => {
    expect(hungerStage(0)).toBe("fed");
    expect(hungerStage(11)).toBe("fed");
    expect(hungerStage(12)).toBe("hungry");
    expect(hungerStage(23)).toBe("hungry");
    expect(hungerStage(24)).toBe("starving");
    expect(hungerStage(30)).toBe("starving");
  });
});
```

- [ ] **Step 2: `hunger.ts`:**

```ts
export const TICKS_PER_HUNGER = 10;
export const HUNGRY_AT = 12;
export const STARVING_AT = 24;
export const HUNGER_MAX = 30;

export type HungerStage = "fed" | "hungry" | "starving";

export function hungerStage(hunger: number): HungerStage {
  if (hunger >= STARVING_AT) {
    return "starving";
  }
  return hunger >= HUNGRY_AT ? "hungry" : "fed";
}
```

- [ ] **Step 3: Failing advance tests.** In `applyTick`, whenever the tick crosses a multiple of `TICKS_PER_HUNGER` (i.e. `tick % TICKS_PER_HUNGER === 0` inside the per-tick loop), hunger +1 (clamped at `HUNGER_MAX`); if the player is starving at that increment, hp −1 but never below 1; `hunger-changed { stage }` fires only when the stage differs from before the increment. Tests: waiting 10 ticks → hunger 1; a state manufactured at hunger 23 waiting 10 ticks → hunger 24 + `hunger-changed {stage:"starving"}`; a starving player at hp 1 loses no further hp. `eat` intent: consumes `player.items[index]`, requires the item's `food` def (else rejected `"you cannot eat that"`), hunger −nutrition (min 0), 1 tick passes, event `ate-food { itemId }`; rejected while in dialogue/trade/combat. Test with the fixture trinket (nutrition 8).

- [ ] **Step 4: Implement** — `EatIntent { type:"eat"; index }`, `AteFoodEvent`, `HungerChangedEvent { stage: HungerStage }` in their unions; logic per Step 3 in `applyTick`/`applyEat`.

## Task 7: Core — combat math (`combat.ts`)

**Files:** create `packages/core/src/combat.ts` + `combat.test.ts`

- [ ] **Step 1: Failing tests** — deterministic golden rolls with the real RNG:

```ts
import { describe, expect, it } from "vitest";
import { rollAttack, rollDamage, rollD20 } from "./combat.ts";
import { seedRng } from "./rng.ts";

describe("combat rolls", () => {
  it("d20 is 1..20 and threads rng deterministically", () => {
    const a = rollD20(seedRng(7));
    const b = rollD20(seedRng(7));
    expect(a).toEqual(b);
    expect(a.value).toBeGreaterThanOrEqual(1);
    expect(a.value).toBeLessThanOrEqual(20);
    expect(a.state).not.toBe(seedRng(7));
  });

  it("damage sums count dice plus bonus within bounds", () => {
    const roll = rollDamage(seedRng(3), { count: 2, sides: 4, bonus: 1 });
    expect(roll.value).toBeGreaterThanOrEqual(3);
    expect(roll.value).toBeLessThanOrEqual(9);
  });

  it("attack hits when d20 + bonus meets armor class", () => {
    // Guaranteed hit/miss via degenerate stats — behavior, not internals:
    const attacker = {
      maxHp: 1,
      attackBonus: 30,
      armorClass: 10,
      damage: { count: 1, sides: 4, bonus: 0 },
    };
    const wall = { ...attacker, attackBonus: -30 };
    const defender = { ...attacker, armorClass: 15 };
    expect(rollAttack(seedRng(1), attacker, defender).hit).toBe(true);
    expect(rollAttack(seedRng(1), wall, defender).hit).toBe(false);
  });

  it("a miss deals zero damage and costs one d20 roll", () => {
    const miss = rollAttack(
      seedRng(1),
      /* wall */ {
        maxHp: 1,
        attackBonus: -30,
        armorClass: 10,
        damage: { count: 1, sides: 4, bonus: 0 },
      },
      { maxHp: 1, attackBonus: 0, armorClass: 15, damage: { count: 1, sides: 4, bonus: 0 } },
    );
    expect(miss.damage).toBe(0);
  });
});
```

- [ ] **Step 2: Implement:**

```ts
import type { CombatantDef, DamageDie } from "./defs.ts";
import { nextInt, type RngState } from "./rng.ts";

export function rollD20(rng: RngState): { value: number; state: RngState } {
  const roll = nextInt(rng, 20);
  return { value: roll.value + 1, state: roll.state };
}

export function rollDamage(rng: RngState, die: DamageDie): { value: number; state: RngState } {
  let state = rng;
  let total = die.bonus;
  for (let i = 0; i < die.count; i += 1) {
    const roll = nextInt(state, die.sides);
    total += roll.value + 1;
    state = roll.state;
  }
  return { value: total, state };
}

export function rollAttack(
  rng: RngState,
  attacker: CombatantDef,
  defender: CombatantDef,
): { hit: boolean; damage: number; state: RngState } {
  const toHit = rollD20(rng);
  if (toHit.value + attacker.attackBonus < defender.armorClass) {
    return { hit: false, damage: 0, state: toHit.state };
  }
  const damage = rollDamage(toHit.state, attacker.damage);
  return { hit: true, damage: damage.value, state: damage.state };
}
```

## Task 8: Core — aggro and chase

**Files:** modify `packages/core/src/npc.ts`, `advance.ts`, `event.ts`; tests `npc.test.ts`, `advance.test.ts`

- [ ] **Step 1: Failing tests** (fixture lair: brute at `x` (3,1), arrival `o` (3,3), open 7×5 room). Scenario: enter the lair (Task 4's walk), NOT sneaking, daytime → within a tick the brute (distance 2, clear LOS, radius 5) gains `alert: true` and event `npc-alerted { npcId }` fires; next tick it steps toward the player; when it becomes adjacent after NPC movement, `combat-started { enemyIds: ["test:brute"] }` fires and `state.combat` is set. Also: with the player back in town (different map), a manufactured alerted brute loses `alert` (`npc-calmed` event) and resumes schedule targeting. And: sneaking at night in the fixture keeps radius 1 — entering at (3,3) with the brute at (3,1) (distance 2) does NOT alert (manufacture tick ≥ 130 for night — 21:00 is tick 130).

- [ ] **Step 2: Implement.** In `applyTick`'s per-tick loop, after `advanceNpcs` + gossip: for each hostile NPC on the player's map — if it can see the player (`perceptionRadius(hourOf(tick), sneaking)` + LOS, same math as `witnesses`) set `alert: true` (event `npc-alerted` on transition); if alerted and (player left the map or Chebyshev distance > `CHASE_RANGE = 10`) clear alert (event `npc-calmed`). `advanceNpcs` gains chase behavior: an NPC with `alert` targets the player's tile instead of its schedule location (same `nextStep`, same occupancy rules — it will stop adjacent because the player tile is occupied). After movement + aggro, if any alerted hostile is Chebyshev-adjacent to the player and `state.combat === null`: `combat = { enemyIds: [every alerted hostile on this map, sorted] }`, event `combat-started`. Combat takes precedence over guard confrontation (check first; skip `findConfronter` when combat starts or is active).

## Task 9: Core — combat rounds (attack, flee, death, loot)

**Files:** modify `packages/core/src/advance.ts`, `intent.ts`, `event.ts`; test `advance.test.ts`

- [ ] **Step 1: Intents/events.** `AttackIntent { type:"attack"; index }` (into `combat.enemyIds`), `FleeIntent { type:"flee"; direction }`. Events: `AttackHitEvent { type:"attack-hit"; attackerId; targetId; damage }`, `AttackMissedEvent { attackerId; targetId }` (attacker/target: NPC id or the literal `"player"` — namespaced ids can't collide), `NpcDiedEvent { npcId }`, `CombatEndedEvent { type:"combat-ended"; outcome: "victory" | "fled" }`.

- [ ] **Step 2: Failing tests** (drive with seeds; loop seeds where an outcome is random, like M3's pickpocket tests):

- While `combat !== null`: `move`/`wait`/`talk`/`take`/`trade`/`sneak`/`eat`/`pickpocket` are rejected (`"not in the middle of a fight"`); `attack`/`flee` are rejected when `combat === null` (`"there is no fight"`).
- `attack {index:0}` on the brute: exactly one player attack resolves (hit → brute hp drops + `attack-hit`; miss → `attack-missed`), then the brute retaliates if alive and adjacent (one enemy attack roll against the player). rng threads; same seed ⇒ identical outcome.
- Killing the brute (loop seeds until victory within reasonable rounds; assert): npc removed from `state.npcs`, its pocket trinket appears in `worldItems` at the brute's last tile on the lair map, `npc-died` + `combat-ended {outcome:"victory"}` fire, `combat === null`.
- `flee` away from an adjacent brute: the brute's opportunity attack resolves first, then the player steps (blocked step = no movement, round still spent); if afterwards the brute is farther than `DISENGAGE_RANGE = 2`, combat ends `"fled"` with the brute still `alert`; else combat continues.
- Enemy turns do NOT advance `state.tick` (assert tick unchanged across an attack round).

- [ ] **Step 3: Implement** `applyAttack`/`applyFlee` in `advance.ts` (shared `enemyTurns(state, events)` helper: for each living enemy in `enemyIds` order — adjacent → `rollAttack(enemy.combat, PLAYER_COMBAT)` against the player; not adjacent → one `nextStep` toward the player on its map; dead/missing enemies are dropped from `enemyIds`; when the list empties → victory). Player hp reaching ≤ 0 during enemy turns short-circuits into Task 10's defeat path (write `applyDefeat` as a stub returning the unchanged state with a `// Task 10` comment if implementing strictly in order — or pull Task 10 forward into this task if the stub feels wrong; record whichever you do).

## Task 10: Core — defeat: robbed, not dead

**Files:** modify `packages/core/src/advance.ts`, `event.ts`; test `advance.test.ts`

- [ ] **Step 1: Failing tests.** Manufacture a combat state with player hp 1 and a brute with overwhelming stats/seed such that the enemy hit lands (loop seeds): after the round, `player-defeated` fires; the player is on the start map at its spawn with `coin 0`, `items []`, `hp === PLAYER_COMBAT.maxHp`, `sneaking false`, `combat === null`; the brute keeps its current hp and loses `alert`; the world is otherwise intact (deeds, rumors, worldItems untouched); tick unchanged.

- [ ] **Step 2: Implement** `PlayerDefeatedEvent { type: "player-defeated" }` + the reset in the enemy-turn resolution.

## Task 11: Content — schemas, finalize, and per-map reachability

**Files:** modify `packages/content/src/schemas.ts`, `finalize.ts`; tests `loader.test.ts`, `finalize.test.ts`

- [ ] **Step 1: Schemas.** New `rumorSchema { type:"rumor", id, text (min 1) }` in the pack-object union. `npcSchema` gains `map: objectMapId.optional()` (plain `z.string().regex(/^[a-z][a-z0-9_]*$/)` — map ids are pack-local, not namespaced), `hostile: z.boolean().optional()`, `combat: z.strictObject({ maxHp: int min 1, attackBonus: int, armorClass: int min 1, damage: z.strictObject({ count: int min 1, sides: int min 2, bonus: int }) }).optional()`. `itemSchema` gains `food: z.strictObject({ nutrition: int min 1 }).optional()`, `treasure: z.boolean().optional()`. Effect union gains `{ type:"rumor", rumor: objectId }`. Tests per the M3 loader-test conventions (parse + one rejection each).

- [ ] **Step 2: Finalize.** Signature: `finalizeWorld({ objects, maps, startMapId })` where `maps: readonly MapModel[]` — build the record, require `startMapId` present. Links: npc `map` defaults to `startMapId` and must exist; `hostile` requires `combat` (`npc "x": hostile without combat stats`); schedule locations resolve on the NPC's OWN map; portals resolve (`map "a": portal to unknown map "b"` / `unknown location "c" on map "b"`); rumor effects resolve to rumor defs; every map's scheduled locations + items + portal tiles must be reachable from that map's entry points (start map: `playerSpawn`; every map: each portal-arrival location targeting it) — union the flood fills per map. Tests: one happy multi-map fixture + one rejection per new rule, following the file's existing helpers. `validate.ts`: drop the "expected exactly one map" guard — load every `maps/*.map.json` and pass them all; the smoke `createGameState` stays.

## Task 12: Content — base pack 0.4.0: the cove, the smugglers, the rumor

**Files:** rename `scripts/build-town-map.ts` → `scripts/build-maps.ts` (update the `build:maps` script in `package.json` if it names the file); modify base pack JSONs; regenerate both maps; test `base.test.ts`

- [ ] **Step 1: Script.** Restructure to build N maps from a table of `{ id, layout, locationLegend, itemLegend, portalLegend }`. Portal legend: char → `{ toMapId, toLocation }`, emitted as a `portals` object layer (objects named `"<toMapId>/<toLocation>"`). Town changes: ONE character edit — row 1 col 27 `.`→`O` (the north-road gap in the coast, walkable), `O` = portal to `smugglers_cove/cove_beach`; plus new location `R`=north_road at row 1 col 26 (`.`→`R`) as the return-arrival tile. (Verify both chars are `.` first; row 1 is `"#............................~~~~~~#"` — cols 1–28 are dots.)
- [ ] **Step 2: The cove layout** — 28×18, `smugglers_cove`, authoritative (every row exactly 28 chars; the script's length check plus the reachability link pass are the safety net, but transcribe carefully):

```ts
const COVE_LAYOUT: readonly string[] = [
  "############################",
  "############################",
  "########............########",
  "##..............4g2.########",
  "##.#####............########",
  "##.###########.#############",
  "##.###########.#############",
  "##.###########.#############",
  "##.#.....................###",
  "##.#........l.n.m........###",
  "##.#.....................###",
  "##.#.....................###",
  "##.###########.#############",
  "##........................##",
  "#..........................#",
  "#.............bQ...........#",
  "#..........................#",
  "############################",
];
```

Coordinate table (verify each after transcribing):

- Chamber interior rows 2–4, cols 8–19; walls: row 1 north, col 7 west (gap at (7,3) — the tunnel's entrance), col 20 east, row 5 south (gap at (14,5) — the mouth).
- Items: `4`=base:pearl_strand (16,3), `2`=base:rum_bottle (18,3); inside post `g`=cove_cellar (17,3), adjacent to the pearl.
- Mouth corridor col 14, rows 5–7, opening onto open ground rows 8–11 (cols 4–24).
- Patrol posts on row 9: `l`=cove_west (12,9), `n`=cove_mouth (14,9), `m`=cove_east (16,9).
- Tide tunnel: col 2 continuous from row 3 down to the beach at row 13; horizontal segment row 3, cols 3–7, into the chamber.
- Rock band row 12 with the only mouth-to-beach gap at (14,12).
- Beach rows 13–16; `b`=cove_beach (14,15); portal `Q` at (15,15) → `port_town/north_road`.

Why this geometry (the encounter design, verified against day perception radius 5):

- The tunnel's chamber entrance (7,3)–(8,3) is Chebyshev ≥ 6 from `g` (17,3), `l`, `n`, and `m` — entering unseen is always possible.
- The heist line runs along row 3: (8,3)→(16,3). Its closest approach to `n` (14,9) is 6 — safe by day _if Tano is away_ (his schedule: at `g` 00–11, at `n` 12–23). Grab the pearl at (16,3) while he guards it at `g` (17,3) and you're at distance 1 — busted. Timing is the mechanic, exactly as the rumor hints.
- The mouth is watched even from inside: (14,4) has clear LOS down the corridor to `n` at distance 5 — walking out the front door by day gets you seen. The tunnel is the professional's exit too.
- The beach (row 15) is ≥ 6 from every post — arriving is safe; the approach through the rock-band gap (14,12) closes to distance 3 from `n` — the frontal approach is the risky one.
- All locations, items, and both portal tiles are mutually reachable (tunnel and mouth both connect beach↔chamber); the link pass enforces this — run `pnpm validate:content` early and often.

- [ ] **Step 3: Content.** `factions.json` += `base:smugglers` ("The Brethren of the Cove"). `npcs.json` += two smugglers on `smugglers_cove`, `hostile: true`:
  - `base:smuggler_lookout` "Vico" — patrols the mouth ground all day: schedule `[{hour:0, location:"cove_west"}, {hour:6, location:"cove_east"}, {hour:12, location:"cove_west"}, {hour:18, location:"cove_east"}]` (`l`↔`m`; his BFS route may detour around Tano at `n` — the occupancy rules handle it). Combat `{ maxHp: 8, attackBonus: 3, armorClass: 12, damage: { count: 1, sides: 6, bonus: 0 } }`, pockets `["base:rum_bottle"]`, dialogue `base:smuggler_talk` — a minimal hostile bark (one node, "You shouldn't be here.", one exit choice; talking to a not-yet-alerted smuggler is legal).
  - `base:smuggler_quartermaster` "Old Tano" — **the timing mechanic**: schedule `[{hour:0, location:"cove_cellar"}, {hour:12, location:"cove_mouth"}]` (`g` then `n`) — he guards the treasure through the night and morning, and drinks at the mouth 12:00–23:59, exactly as the rumor says. Combat `{ maxHp: 10, attackBonus: 4, armorClass: 13, damage: { count: 1, sides: 8, bonus: 1 } }`, pockets `["base:silver_ring"]`, same bark dialogue.
  - `items.json`: `base:pearl_strand { value: 60, treasure: true }` new; `base:dried_fish` gains `food: { nutrition: 8 }`; `base:rum_bottle` gains `food: { nutrition: 2 }`.
  - `rumors.json` (new): `base:cove_cache` — text: `"The Brethren cache their haul in the cove up the north road. The old quartermaster drinks at the cave mouth from midday — his cellar stands unwatched till dark, if you know the tide-tunnel."`
  - `dialogues.json`: tavernkeeper `hello` node gains `{ text: "What's the word on the coast? (10 coin)", condition: {coin-at-least 10}, effects: [{pay 10}, {rumor base:cove_cache}], next: "word" }` + node `word` echoing the hint; harbormaster's existing standing-gated `hint` node gains the rumor effect (free for trusted friends — two extraction paths, spec §4.3).
  - `pack.json` → `0.4.0`.
- [ ] **Step 4: Tests + gate.** `base.test.ts`: world has 2 maps, smugglers hostile with combat, rumor linked, pearl treasure, fish is food; counts updated. `pnpm build:maps && pnpm validate:content` green (this is where cove geometry errors surface — fix the LAYOUT, rerun). Full gate.

## Task 13: Client — many maps, combat, hunger, journal

**Files:** modify `packages/client/index.html`, `src/ui.ts`, `src/world-scene.ts`

- [ ] **Step 1: Map switching.** `preload()` loads BOTH tilemaps (`port_town`, `smugglers_cove` — import both JSONs); `create()` renders `currentMap`'s tilemap by key = `state.mapId`. On `map-changed`: `this.scene.restart()` (state and world persist on the instance? No — restart re-runs `create()`; persist `state` across restarts by keeping it in the scene's constructor-independent field and guarding `loadOrCreateState` to reuse an in-memory state if present: add `private pendingState?: GameState` handed through `scene.restart({ ... })` data or a module-level holder — pick the simplest working pattern and note it). Camera bounds use the current map's dimensions. NPC/item sprites render only entities with `mapId === state.mapId`.
- [ ] **Step 2: HUD.** `#hud` gains `HP 12/12` (`data-testid="hp"`) and hunger stage (`data-testid="hunger"`, shows `Fed/Hungry/Starving`, hidden text ok). Inventory items with a `food` def get an "Eat" button (dispatch `{type:"eat", index}`).
- [ ] **Step 3: Journal.** New `#journal` aside under inventory listing heard rumor texts (`world.rumors[id].text`), `aria-label="Journal"`; `rumor-heard` also toasts "You note it in your journal."
- [ ] **Step 4: Combat panel.** `#combat` section (like dialogue): title "Steel is drawn!", enemy list with name + HP bar (`data-testid` per enemy id), an Attack button per enemy (dispatch `{type:"attack", index}`), hint "flee with movement keys". While `state.combat !== null`, arrow/WASD keys dispatch `{type:"flee", direction}` instead of `move` (client-side key mapping only — core enforces the rules either way). Events: `attack-hit`/`attack-missed` float damage text over the target sprite (or player), `npc-died` removes the sprite + toast, `combat-started`/`combat-ended` toast, `player-defeated` shows a full-width banner ("You wake on the docks, stripped of everything…") that any key dismisses; `map-changed` → restart per Step 1; `ate-food`/`hunger-changed` update HUD via `renderUi` + toast on stage worsening; `fortune-made` — see Task 14 note; wire the victory banner when implemented.
- [ ] **Step 5:** hint line: `Arrows/WASD move · E talk · Space wait · C sneak · G take · P pickpocket · T trade · 1-5 choose · Esc close` (eat/attack are buttons). Full gate + `pnpm build`.

## Task 14: Core + e2e — the fortune beat and the storied journey

**Files:** modify `packages/core/src/advance.ts`, `event.ts`, `state.ts` (flags already exist); create `e2e/storied.spec.ts`

- [ ] **Step 1: Fortune flag (core, TDD).** In `applySell`: if the sold item's def has `treasure: true` and `!state.flags.fortuneMade` → `flags.fortuneMade = true` + event `fortune-made`. Test via fixture loot. Client (small follow-up to Task 13): `fortune-made` shows a celebratory banner ("Word will spread of this. Your fortune has begun." — v0's success beat).
- [ ] **Step 2: e2e `storied.spec.ts`** — the v0 criterion, scripted (routes derived from the ACTUAL committed cove layout; derive coordinates from the generated JSON, comment them):
  1. **Rumor**: walk to the tavernkeeper, buy the rumor (assert coin −10, journal shows the text, `state.rumors` contains it).
  2. **Journey + heist**: wait until after 12:00 (Tano at the mouth), walk the north road portal, cross to the cove (assert `mapId`), take the tide tunnel, `take` the pearl strand (assert unwitnessed: the theft deed's `knownBy` is `[]` — the clean crime), return through the tunnel and portal.
  3. **Profit**: sell the pearl to the merchant (assert coin jump and `flags.fortuneMade === true`).
  4. **Steel (separate test)**: enter the cove before noon, walk at the mouth in daylight → assert `npc-alerted`/combat begins within bounded waits (assert `state.combat !== null`), then flee toward the beach until `combat === null`, exit via portal (alert clears on map change).
  5. **Hunger (separate test)**: wait 120 ticks, assert hunger stage HUD changed; buy + eat a dried fish, assert stage back to Fed.
- [ ] **Step 3:** `pnpm test:e2e` fully green (all four spec files).

## Task 15: ADR-0004, deviations, PR

- [ ] **Step 1:** `docs/adr/0004-many-maps-rumors-and-steel.md` (ADR-0003's format): multi-map + portals model; rumors as knowledge not quests; D&D-shaped combat encounter mode pointed at party combat + detailed inventory (owner direction); aggro via awareness; robbed-not-dead; hunger clock with the no-starvation-death v0 cap; deferred: murder-as-crime, combat XP/gear, eavesdropping/lockpicking (M5+), per-pack combat/hunger tuning.
- [ ] **Step 2:** Record execution deviations in this plan (M3's format). Reread the plan start-to-finish against the diff.
- [ ] **Step 3:** Full release gate (`lint`, `format:check`, `typecheck`, `test`, `test:e2e`, `validate:content`, `check:attribution`), push, PR titled `M4: a storied world — rumors, the cove heist, first steel (v0)`, body describing what's in the diff (factual, no superlatives), ending with the standard generated-with footer.

---

## Self-review checklist

- **Spec coverage (M4, §7):** rumors extractable via reputation AND coin → Tasks 5, 12; rumor leads out of town → Tasks 1, 4, 12; payoff guarded by an encounter stealth can bypass entirely → cove geometry + timing (Task 12) on the M3 awareness model; simple turn-based fight when the plan fails → Tasks 7–9; desperation (hunger, coin) → Task 6 + fine/trade pressure from M3; success criterion visible → Task 14. Every milestone ends playable and deployed → Task 15.
- **Descoped knowingly:** murder-as-deed, starvation death, combat gear/equipment (inventory system future), party members, rumor-driven world generation (cove is static), eavesdropping/lockpicking.
- **Type consistency:** `currentMap(state, world)` (Tasks 2–4, 8); `advanceNpcs({npcs, playerPos, playerMapId, world, tick})` (Tasks 3, 8); `applyTick(state, playerPos, events, world, {ticks?, playerMapId?})` (Tasks 4, 6, 8); `rollAttack(rng, attacker, defender)` (Tasks 7, 9); event names as listed in Tasks 4–10, 14.
