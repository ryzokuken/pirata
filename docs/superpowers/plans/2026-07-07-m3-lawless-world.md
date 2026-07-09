# Pirata M3: A Lawless World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the crime loop: the player can sneak, steal, and pickpocket; NPCs who see it remember, spread the word by gossip over in-game time, and the world answers with prices, refusals, and a watchwoman demanding a fine — while items, coin, and a minimal buy/sell shop make crime (and honesty) profitable.

**Architecture:** Reputation semantics change from M2's instant-faction rule to knowledge-based: `DeedRecord` gains a `knownBy` witness set, standings are computed from what each party knows, and a gossip pass merges knowledge between NPCs in conversation range each tick. New pure core modules: `awareness.ts` (line of sight + perception), `gossip.ts`, `trade.ts`; new intents (`sneak`, `take`, `pickpocket`, `trade`, `buy`, `sell`, `close-trade`) flow through the existing `advance()`. Content grows `item` and `crime` object types plus NPC `pockets`/`shop`/`confront` fields; the map grows an `items` object layer. The client stays rule-free: new DOM panels (inventory, trade) and event feedback. Spec: `docs/superpowers/specs/2026-07-05-pirata-design.md` (§4.3 stealth/crime, factions/reputation; roadmap M3).

**Tech Stack:** Unchanged — TypeScript strict/ESM, pnpm workspaces, Phaser 4, Vite, Zod 4, vitest + fast-check, Playwright, oxlint + oxfmt. **No new dependencies.**

---

## Execution ground rules

- Work on branch `feat/m3-lawless-world`. Never commit or push to `main` (now branch-protected: `checks` + `e2e` required).
- Pushing this repo does **not** require the YubiKey (standing exception): push the feature branch, open a PR at the end.
- Every task ends green: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` before every commit. Run `pnpm format` first if oxfmt complains (it formats markdown too).
- `pnpm test:e2e` is NOT in the per-commit gate; it must be green at Task 15 and before the PR.
- TDD throughout: failing test first, watch it fail for the right reason, implement, watch it pass.
- Commits: imperative, ≤72-char subject, one logical change, trailer `Co-Authored-By: Claude <noreply@anthropic.com>`.
- The `window.__pirata` debug hook (getState/dispatch) must keep working — e2e drives it.
- The RNG golden-sequence test (`rng.test.ts`) must NOT change.

## Scope decisions (project owner, 2026-07-07)

- **Verbs:** sneak, pickpocket, theft (`take`). Eavesdropping and lockpicking are M4 (a locked door is a natural rumor-payoff obstacle; eavesdropping's payload is rumors).
- **Trade:** minimal buy/sell at one merchant IS in scope — the spec lists "prices" as an M3 consequence, and fencing stolen goods is what makes theft profitable.
- **Combat does not exist yet** (M4). The guard consequence is a fine demanded through forced dialogue; escalation (chase, jail) is deferred.

## Design decisions (why the code below looks the way it does)

- **Knowledge-based reputation** (spec §4.3: "standing … is computed from what that party knows"). `DeedRecord` becomes `{deedId, tick, knownBy, npcId?}`: `knownBy` is the sorted list of NPC ids who know of the deed; `npcId` is the target NPC when there is one (dialogue deeds, pickpocket victims). `npcStanding(npc)` sums deeds where `npc ∈ knownBy`; `factionStanding(f)` sums deeds known by _any_ member (no double-counting — one record counts once however many members know). This deletes M2's instant-faction rule.
- **Gossip is adjacency, not simulation.** Each tick, NPC pairs within Chebyshev distance ≤ 2 _with line of sight_ merge deed knowledge (both directions). No RNG, no rates: knowledge travels when schedules co-locate people — the tavern at night is the rumor mill. Evasion works: leave before witnesses meet anyone.
- **All deeds gossip**, kind words included. A reputation for generosity spreads the same way infamy does.
- **Crimes are content data**: a `crime` object maps a verb (`pickpocket` | `theft`) to a deed id. A pack that defines no crime for a verb gets the intent rejected with a clear reason ("this world knows no law against it") — fail-safe, no silent no-consequence crimes.
- **Unwitnessed crimes still land on the ledger** with `knownBy: []` — zero standing impact anywhere (nobody knows), but the deed exists for replay/debugging and future mechanics (evidence, confession).
- **Awareness model, minimal:** an NPC sees a tile if Chebyshev distance ≤ perception radius AND a Bresenham line between the two tiles crosses no blocked tile. Radius: 5 by day, 2 at night (hour ≥ 21 or < 5 — the clock finally matters for stealth), halved (ceil) while the player sneaks. Sneaking is a free toggle but movement while sneaking costs **2 ticks** — stealth trades time, so it is not a dominant strategy.
- **Pickpocket** is the one RNG verb (first gameplay use of `state.rng`): success chance 0.5, 0.8 while sneaking. Success lifts the victim's first pocket item and the victim does NOT witness; anyone else in sight does. Failure lifts nothing and the victim always witnesses (union with bystanders). Either way the crime deed is recorded — a botched attempt is the crime too.
- **Theft (`take`)** picks up the item on the player's own tile. Every map-placed item is owned (stall goods, warehouse stock) — unowned loot arrives with M4 payoff sites.
- **Guard confrontation is knowledge-gated:** an NPC with a `confront` def forces dialogue when adjacent (Chebyshev ≤ 1) to the player AND their _personal_ standing (what they know) is below the threshold. Word must reach the watch — witness, or gossip — before consequences find you. Paying the fine applies a positive deed known by the guard, lifting their standing back over the threshold. The merchants' guild does NOT forgive because you squared with the watch — their members still know the theft; win them back separately.
- **Trade bands** (constants in core for now; they become content data when a second shop wants different values): shopkeeper's faction standing s — s ≤ −20 refuses; −20 < s < 0 wary (buy ceil(1.5×value), sell floor(0.25×value)); 0 ≤ s < 25 normal (value / floor(0.5×value)); s ≥ 25 friendly (ceil(0.8×value) / floor(0.6×value)). Stock is infinite and the shop buys anything — stolen-goods flags are deferred.
- **Dialogue vocabulary grows by demand** (spec §4.4): condition `coin-at-least`, effect `pay {amount}`. `pay` is atomic: if total pay of a choice exceeds coin, the whole choice is rejected — content should gate with `coin-at-least`, core protects regardless.
- **Trade is a mode like dialogue** (`state.trade`), with its own intents; movement is rejected while trading; trading costs no ticks.
- **Save compatibility:** `GameState` changes shape → `SAVE_VERSION = 3`. Old saves rejected by `deserialize`; the client already falls back to a fresh game (designed path).
- **Client compiles at every commit:** core tasks that add `GameEvent` members each append the new event names to the client's no-op `case` group in `renderEvent` (one-line edit); Task 14 replaces those no-ops with real feedback.

## File structure

```
pirata/
├── docs/adr/0003-crime-gossip-and-coin.md          # new ADR (Task 16)
├── scripts/build-town-map.ts                        # MODIFY: items layer, watch locations
├── e2e/
│   ├── social.spec.ts                               # MODIFY: deeds now carry knownBy
│   └── crime.spec.ts                                # new Playwright spec
└── packages/
    ├── core/src/
    │   ├── map.ts             # MODIFY: `items` object layer
    │   ├── map.test.ts        # MODIFY
    │   ├── defs.ts            # MODIFY: ItemDef, CrimeVerb, NpcDef pockets/shop/confront,
    │   │                      #         coin-at-least condition, pay effect
    │   ├── state.ts           # MODIFY: coin/items/sneaking, pockets, worldItems, trade,
    │   │                      #         knownBy; PLAYER_START_COIN
    │   ├── state.test.ts      # MODIFY
    │   ├── save.ts            # MODIFY: SAVE_VERSION = 3
    │   ├── save.test.ts       # MODIFY
    │   ├── reputation.ts      # MODIFY: knowledge-based standings
    │   ├── reputation.test.ts # MODIFY (rewrite)
    │   ├── awareness.ts       # new: lineOfSight, perceptionRadius, witnesses
    │   ├── awareness.test.ts
    │   ├── gossip.ts          # new: spreadGossip
    │   ├── gossip.test.ts
    │   ├── trade.ts           # new: tradeRefused, buyPrice, sellPrice
    │   ├── trade.test.ts
    │   ├── intent.ts          # MODIFY: sneak/take/pickpocket/trade/buy/sell/close-trade
    │   ├── event.ts           # MODIFY: new event members
    │   ├── advance.ts         # MODIFY: new verbs, gossip + confrontation in applyTick
    │   ├── advance.test.ts    # MODIFY
    │   ├── dialogue.ts        # MODIFY: coin-at-least condition
    │   ├── dialogue.test.ts   # MODIFY
    │   ├── world.fixture.ts   # MODIFY: items, crimes, guard, shop, pockets
    │   └── index.ts           # MODIFY: export the new API
    ├── content/
    │   ├── src/
    │   │   ├── schemas.ts     # MODIFY: item/crime schemas; npc + dialogue extensions
    │   │   ├── loader.test.ts # MODIFY
    │   │   ├── finalize.ts    # MODIFY: items/crimes buckets + link pass
    │   │   ├── finalize.test.ts # MODIFY
    │   │   └── base.ts        # MODIFY: load items.json, crimes.json
    │   └── packs/base/
    │       ├── pack.json      # MODIFY: version 0.3.0
    │       ├── items.json     # new
    │       ├── crimes.json    # new
    │       ├── deeds.json     # MODIFY: crime + watch deeds
    │       ├── factions.json  # MODIFY: town watch
    │       ├── npcs.json      # MODIFY: guard, pockets, shop, confront
    │       ├── dialogues.json # MODIFY: guard talk + confrontation
    │       └── maps/port_town.map.json  # regenerated (never hand-edit)
    └── client/
        ├── index.html         # MODIFY: inventory + trade panels, hint line
        └── src/
            ├── ui.ts          # MODIFY: renderInventory, renderTrade
            └── world-scene.ts # MODIFY: keys, item sprites, sneak alpha, event feedback
```

Boundaries unchanged: `core` imports nothing; `content` produces `WorldDef`; `client` renders.

---

## Task 1: Core — `items` object layer in the map model

**Files:**

- Modify: `packages/core/src/map.ts`
- Test: `packages/core/src/map.test.ts`
- Modify: `packages/core/src/world.fixture.ts`

- [x] **Step 1: Add failing tests** — append to `packages/core/src/map.test.ts`, and add an `items` layer to the existing `tiledFixture()` `layers` array:

```ts
      {
        name: "items",
        type: "objectgroup",
        objects: [{ name: "test:coin_pouch", x: 32, y: 32 }],
      },
```

Append tests:

```ts
describe("parseTiledMap items", () => {
  it("reads placed items in tile coordinates", () => {
    const map = parseTiledMap("test", tiledFixture());
    expect(map.items).toEqual([{ itemId: "test:coin_pouch", pos: { x: 1, y: 1 } }]);
  });

  it("defaults to no items when the layer is absent", () => {
    const fixture = tiledFixture();
    fixture["layers"] = (fixture["layers"] as { name: string }[]).filter(
      (layer) => layer.name !== "items",
    );
    expect(parseTiledMap("test", fixture).items).toEqual([]);
  });

  it("allows duplicate item placements", () => {
    const fixture = tiledFixture();
    const layers = fixture["layers"] as { name: string; objects?: object[] }[];
    layers
      .find((layer) => layer.name === "items")
      ?.objects?.push({
        name: "test:coin_pouch",
        x: 64,
        y: 32,
      });
    expect(parseTiledMap("test", fixture).items).toHaveLength(2);
  });

  it("rejects an item on a blocked tile", () => {
    const fixture = tiledFixture();
    const layers = fixture["layers"] as { name: string; objects?: object[] }[];
    layers
      .find((layer) => layer.name === "items")
      ?.objects?.push({
        name: "test:anchor",
        x: 0,
        y: 0,
      });
    expect(() => parseTiledMap("blocked", fixture)).toThrow(/"test:anchor".*not on walkable/);
  });
});
```

(The existing fixture is 3×2 with walls `[2, 0, 0, 0, 0, 2]`: (0,0) blocked, (1,1) open.)

- [x] **Step 2: Run to verify failure**

Run: `pnpm test`
Expected: FAIL — `map.items` is undefined.

- [x] **Step 3: Implement in `packages/core/src/map.ts`**

Add to the interface (below `locations`):

```ts
export interface MapItem {
  readonly itemId: string;
  readonly pos: Vec2;
}
```

and in `MapModel`:

```ts
  readonly items: readonly MapItem[];
```

In `parseTiledMap`, after the locations loop and before the `return`, add:

```ts
const items: MapItem[] = [];
const itemLayer = layers.find((layer) => layer.type === "objectgroup" && layer.name === "items");
for (const object of itemLayer?.objects ?? []) {
  const pos = {
    x: Math.floor(object.x / map.tilewidth),
    y: Math.floor(object.y / map.tileheight),
  };
  const outOfBounds = pos.x < 0 || pos.y < 0 || pos.x >= map.width || pos.y >= map.height;
  if (outOfBounds || (blocked[pos.y * map.width + pos.x] ?? true)) {
    throw new MapParseError(
      `map "${id}": item "${object.name}" at (${pos.x},${pos.y}) is not on walkable ground`,
    );
  }
  items.push({ itemId: object.name, pos });
}
```

and include `items` in the returned object.

- [x] **Step 4: Extend `mapFromAscii`** — in `packages/core/src/world.fixture.ts`, digits `1`–`9` are walkable tiles carrying an item named by the legend:

```ts
export function mapFromAscii(
  rows: readonly string[],
  itemLegend: Readonly<Record<string, string>> = {},
): MapModel {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const blocked: boolean[] = [];
  const locations: Record<string, Vec2> = {};
  const items: { itemId: string; pos: Vec2 }[] = [];
  let spawn = { x: 1, y: 1 };
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      blocked.push(ch === "#");
      if (ch === "P") {
        spawn = { x, y };
      }
      if (ch >= "a" && ch <= "z") {
        locations[ch] = { x, y };
      }
      const itemId = itemLegend[ch];
      if (ch >= "1" && ch <= "9" && itemId !== undefined) {
        items.push({ itemId, pos: { x, y } });
      }
    });
  });
  return { id: "fixture", width, height, blocked, playerSpawn: spawn, locations, items };
}
```

(The `FIXTURE_MAP` call gains no items yet; `items: []` comes out of the default legend. Task 3 rebuilds the fixture town.)

- [x] **Step 5: Fix compile fallout** — `mapFromAscii`'s return now needs `items`; the local map fixture inside `advance.test.ts` (if it builds a `MapModel` literal) and any other `MapModel` literals need `items: []`. Search: `rg -l "playerSpawn" packages/core/src packages/client/src` and add `items: []` to every literal. The client parses maps via `parseTiledMap`, so it needs no change.

- [x] **Step 6: Verify pass, full gate, commit**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Parse placed items from a Tiled items object layer"
```

## Task 2: Core — definition types for items, crimes, and NPC extensions

Types only; the compiler is the test.

**Files:**

- Modify: `packages/core/src/defs.ts`, `packages/core/src/index.ts`

- [x] **Step 1: Extend `packages/core/src/defs.ts`**

Add:

```ts
export interface ItemDef {
  readonly id: string;
  readonly name: string;
  readonly value: number;
}

export type CrimeVerb = "pickpocket" | "theft";

export interface ShopDef {
  readonly sells: readonly string[];
}

export interface ConfrontDef {
  readonly standingBelow: number;
  readonly dialogueId: string;
}
```

Extend `NpcDef` with three fields (after `schedule`):

```ts
  readonly pockets: readonly string[];
  readonly shop?: ShopDef;
  readonly confront?: ConfrontDef;
```

Extend `DialogueCondition` union with:

```ts
  | { readonly type: "coin-at-least"; readonly value: number }
```

Replace `DialogueEffect` with a union:

```ts
export type DialogueEffect =
  | { readonly type: "deed"; readonly deedId: string }
  | { readonly type: "pay"; readonly amount: number };
```

Extend `WorldDef` with:

```ts
  readonly items: Readonly<Record<string, ItemDef>>;
  readonly crimes: Readonly<Partial<Record<CrimeVerb, string>>>;
```

- [x] **Step 2: Fix compile fallout across core**

- `world.fixture.ts` `fixtureWorld()`: add `items: {}`, `crimes: {}` to the returned object and `pockets: []` to both NPCs (Task 3 replaces this with the real fixture).
- `finalize.ts` (content) will fail to compile — `WorldDef` gained fields. Add to its return object:

```ts
return { map: options.map, factions, npcs, dialogues, deeds, items: {}, crimes: {} };
```

and add `pockets: []` to the npc bucket entry (temporary; Task 12 finishes content).

- The client's `renderEvent` needs nothing yet (no new events).

- [x] **Step 3: Export from `packages/core/src/index.ts`** — extend the defs type-export block with `ConfrontDef`, `CrimeVerb`, `ItemDef`, `ShopDef` (keep alphabetical order).

- [x] **Step 4: Full gate and commit**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Add item, crime, shop, and confrontation definition types"
```

## Task 3: Core — GameState v3, fixture town v3, SAVE_VERSION 3

**Files:**

- Modify: `packages/core/src/state.ts`, `packages/core/src/save.ts`, `packages/core/src/world.fixture.ts`, `packages/core/src/index.ts`, `packages/core/src/advance.ts`
- Test: `packages/core/src/state.test.ts`, `packages/core/src/save.test.ts`

- [x] **Step 1: Rebuild the fixture town** — replace `FIXTURE_MAP` and `fixtureWorld()` in `packages/core/src/world.fixture.ts`:

```ts
export const FIXTURE_MAP = mapFromAscii(
  ["########", "#P..g.a#", "#.####.#", "#b.1...#", "####t###", "########"],
  { "1": "test:trinket" },
);

export function fixtureWorld(): WorldDef {
  return {
    map: FIXTURE_MAP,
    factions: {
      "test:guild": { id: "test:guild", name: "The Guild" },
      "test:dockers": { id: "test:dockers", name: "The Dockers" },
      "test:watch": { id: "test:watch", name: "The Watch" },
    },
    items: {
      "test:trinket": { id: "test:trinket", name: "Brass trinket", value: 10 },
      "test:pearl": { id: "test:pearl", name: "Pearl", value: 15 },
    },
    crimes: { pickpocket: "test:pickpocketing", theft: "test:theft" },
    deeds: {
      "test:praise": { id: "test:praise", name: "Praise", standingDelta: 10 },
      "test:slight": { id: "test:slight", name: "Slight", standingDelta: -10 },
      "test:pickpocketing": { id: "test:pickpocketing", name: "Pickpocketing", standingDelta: -15 },
      "test:theft": { id: "test:theft", name: "Theft", standingDelta: -20 },
      "test:paid_fine": { id: "test:paid_fine", name: "Paid a fine", standingDelta: 25 },
      "test:defied": { id: "test:defied", name: "Defied the watch", standingDelta: -5 },
    },
    npcs: {
      "test:keeper": {
        id: "test:keeper",
        name: "Keeper",
        factionId: "test:guild",
        dialogueId: "test:keeper_talk",
        schedule: [{ hour: 0, location: "t" }],
        pockets: ["test:pearl"],
        shop: { sells: ["test:trinket"] },
      },
      "test:walker": {
        id: "test:walker",
        name: "Walker",
        factionId: "test:dockers",
        dialogueId: "test:walker_talk",
        schedule: [
          { hour: 8, location: "a" },
          { hour: 9, location: "b" },
        ],
        pockets: [],
      },
      "test:guard": {
        id: "test:guard",
        name: "Guard",
        factionId: "test:watch",
        dialogueId: "test:walker_talk",
        schedule: [{ hour: 0, location: "g" }],
        pockets: [],
        confront: { standingBelow: -10, dialogueId: "test:guard_confront" },
      },
    },
    dialogues: {
      "test:keeper_talk": {
        id: "test:keeper_talk",
        start: "hello",
        nodes: {
          hello: {
            text: "What'll it be?",
            choices: [
              {
                text: "Compliment",
                effects: [{ type: "deed", deedId: "test:praise" }],
                next: "smile",
              },
              { text: "Insult", effects: [{ type: "deed", deedId: "test:slight" }] },
              {
                text: "Secret?",
                condition: { type: "npc-standing-at-least", value: 10 },
                next: "secret",
              },
              { text: "Bye" },
            ],
          },
          smile: { text: "Much obliged.", choices: [{ text: "Bye" }] },
          secret: { text: "The cellar door is never locked.", choices: [{ text: "Bye" }] },
        },
      },
      "test:walker_talk": {
        id: "test:walker_talk",
        start: "hello",
        nodes: { hello: { text: "Keep moving.", choices: [{ text: "Bye" }] } },
      },
      "test:guard_confront": {
        id: "test:guard_confront",
        start: "halt",
        nodes: {
          halt: {
            text: "Word travels, thief. Pay the fine or answer for it.",
            choices: [
              {
                text: "Pay 20 coin",
                condition: { type: "coin-at-least", value: 20 },
                effects: [
                  { type: "pay", amount: 20 },
                  { type: "deed", deedId: "test:paid_fine" },
                ],
              },
              { text: "I owe you nothing", effects: [{ type: "deed", deedId: "test:defied" }] },
            ],
          },
        },
      },
    },
  };
}
```

Geometry facts the tests rely on: player spawns at (1,1); guard post `g` is (4,1); walker
commutes `a` (6,1) → `b` (1,3) at hour 9, passing (4,3) — Chebyshev distance 1 from the
keeper's nook `t` (4,4); the trinket lies at (3,3), diagonal-adjacent to the keeper (who
therefore witnesses theft there) and walled off from the guard (row 2 is solid).

- [x] **Step 2: Write the failing tests** — replace `packages/core/src/state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createGameState, PLAYER_START_COIN } from "./state.ts";
import { fixtureWorld } from "./world.fixture.ts";

describe("createGameState", () => {
  it("spawns the player with starting coin, no items, not sneaking", () => {
    const state = createGameState({ seed: 7, world: fixtureWorld() });
    expect(state.tick).toBe(0);
    expect(state.player).toEqual({
      pos: { x: 1, y: 1 },
      coin: PLAYER_START_COIN,
      items: [],
      sneaking: false,
    });
    expect(state.dialogue).toBeNull();
    expect(state.trade).toBeNull();
    expect(state.deeds).toEqual([]);
  });

  it("seeds world items from the map and pockets from NPC defs", () => {
    const state = createGameState({ seed: 7, world: fixtureWorld() });
    expect(state.worldItems).toEqual([{ itemId: "test:trinket", pos: { x: 3, y: 3 } }]);
    expect(state.npcs).toEqual([
      { id: "test:guard", pos: { x: 4, y: 1 }, pockets: [] },
      { id: "test:keeper", pos: { x: 4, y: 4 }, pockets: ["test:pearl"] },
      { id: "test:walker", pos: { x: 6, y: 1 }, pockets: [] },
    ]);
  });

  it("rejects two NPCs spawning on the same tile", () => {
    const world = fixtureWorld();
    const clash = {
      ...world,
      npcs: {
        ...world.npcs,
        "test:squatter": { ...world.npcs["test:walker"]!, id: "test:squatter" },
      },
    };
    expect(() => createGameState({ seed: 7, world: clash })).toThrow(/same tile/);
  });

  it("rejects a schedule location missing from the map", () => {
    const world = fixtureWorld();
    const lost = {
      ...world,
      npcs: {
        "test:lost": {
          ...world.npcs["test:keeper"]!,
          id: "test:lost",
          schedule: [{ hour: 0, location: "z" }],
        },
      },
    };
    expect(() => createGameState({ seed: 7, world: lost })).toThrow(/test:lost/);
  });
});
```

And replace `packages/core/src/save.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deserialize, SaveError, serialize } from "./save.ts";
import { createGameState } from "./state.ts";
import { fixtureWorld } from "./world.fixture.ts";

describe("save round-trip", () => {
  it("serializes and deserializes to an identical state", () => {
    const state = {
      ...createGameState({ seed: 7, world: fixtureWorld() }),
      dialogue: { npcId: "test:keeper", nodeId: "hello" },
      deeds: [
        { deedId: "test:theft", tick: 3, knownBy: ["test:keeper"] },
        { deedId: "test:praise", npcId: "test:keeper", tick: 5, knownBy: ["test:keeper"] },
      ],
    };
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it("rejects malformed JSON", () => {
    expect(() => deserialize("not json{")).toThrow(SaveError);
  });

  it("rejects the M2 save version", () => {
    expect(() => deserialize(JSON.stringify({ version: 2, state: {} }))).toThrow(/version 2/);
  });

  it("rejects a payload without state", () => {
    expect(() => deserialize(JSON.stringify({ version: 3 }))).toThrow(SaveError);
  });
});
```

- [x] **Step 3: Run to verify failure** (`pnpm test` — FAIL: player shape, missing state fields, save version)

- [x] **Step 4: Rewrite the state types in `packages/core/src/state.ts`**

```ts
export const PLAYER_START_COIN = 20;

export interface PlayerState {
  readonly pos: Vec2;
  readonly coin: number;
  readonly items: readonly string[];
  readonly sneaking: boolean;
}

export interface NpcState {
  readonly id: string;
  readonly pos: Vec2;
  readonly pockets: readonly string[];
}

export interface WorldItem {
  readonly itemId: string;
  readonly pos: Vec2;
}

export interface TradeState {
  readonly npcId: string;
}

export interface DeedRecord {
  readonly deedId: string;
  readonly tick: number;
  readonly knownBy: readonly string[];
  readonly npcId?: string;
}

export interface GameState {
  readonly tick: number;
  readonly rng: RngState;
  readonly mapId: string;
  readonly player: PlayerState;
  readonly npcs: readonly NpcState[];
  readonly worldItems: readonly WorldItem[];
  readonly dialogue: DialogueState | null;
  readonly trade: TradeState | null;
  readonly deeds: readonly DeedRecord[];
}
```

(`Vec2`, `DialogueState` unchanged.) In `createGameState`, push
`{ id: npcId, pos, pockets: def.pockets }` for each NPC, and return:

```ts
return {
  tick: 0,
  rng: seedRng(options.seed),
  mapId: world.map.id,
  player: { pos: world.map.playerSpawn, coin: PLAYER_START_COIN, items: [], sneaking: false },
  npcs,
  worldItems: world.map.items.map((item) => ({ itemId: item.itemId, pos: item.pos })),
  dialogue: null,
  trade: null,
  deeds: [],
};
```

- [x] **Step 5: Bump `packages/core/src/save.ts`** — `export const SAVE_VERSION = 3;`

- [x] **Step 6: Fix compile fallout**

- `advance.ts` `applyChoose`: deed records now need `knownBy` (real semantics land in Task 4; make it compile correctly now):

```ts
deeds = [...deeds, { deedId: effect.deedId, npcId, tick: state.tick, knownBy: [npcId] }];
```

and `applyTick`/`applyMove` build `player` from parts — replace every `player: { pos: … }` with `player: { ...state.player, pos: … }`.

- `advance.test.ts`, `dialogue.test.ts`, `reputation.test.ts`, `npc.test.ts`, `harness.test.ts`: any literal `DeedRecord` gains `knownBy: [<the npcId it names>]`; any literal `NpcState` gains `pockets: []`. Expected-value assertions that now fail for the _right reason_ (shape) get updated here; assertions that fail because reputation semantics changed are rewritten in Task 4 — if any test asserts M2 instant-faction behavior that no longer compiles cleanly, mark the semantic rewrite with the new shape but keep the old expectation (it will fail in Task 4's red step, which is the point).
- `index.ts`: export `PLAYER_START_COIN` and the types `TradeState`, `WorldItem` from `./state.ts`.
- Client `world-scene.ts` compiles unchanged (it reads `player.pos`, `npcs[].pos/id`, `dialogue`).

- [x] **Step 7: Verify pass, full gate, commit**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Extend GameState with coin, items, pockets, trade (save v3)"
```

## Task 4: Core — knowledge-based reputation

**Files:**

- Modify: `packages/core/src/reputation.ts`, `packages/core/src/advance.ts`
- Test: `packages/core/src/reputation.test.ts` (rewrite), `packages/core/src/advance.test.ts`

- [x] **Step 1: Write the failing tests** — replace `packages/core/src/reputation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { factionStanding, npcStanding } from "./reputation.ts";
import { createGameState, type GameState } from "./state.ts";
import { fixtureWorld } from "./world.fixture.ts";

const world = fixtureWorld();

function stateWithDeeds(deeds: GameState["deeds"]): GameState {
  return { ...createGameState({ seed: 1, world }), deeds };
}

describe("knowledge-based standing", () => {
  it("is zero with an empty ledger", () => {
    const state = stateWithDeeds([]);
    expect(npcStanding(state, world, "test:keeper")).toBe(0);
    expect(factionStanding(state, world, "test:guild")).toBe(0);
  });

  it("counts only deeds the NPC knows about", () => {
    const state = stateWithDeeds([
      { deedId: "test:theft", tick: 1, knownBy: ["test:keeper"] },
      { deedId: "test:slight", npcId: "test:walker", tick: 2, knownBy: ["test:walker"] },
    ]);
    expect(npcStanding(state, world, "test:keeper")).toBe(-20);
    expect(npcStanding(state, world, "test:walker")).toBe(-10);
    expect(npcStanding(state, world, "test:guard")).toBe(0);
  });

  it("gives an unwitnessed deed no standing anywhere", () => {
    const state = stateWithDeeds([{ deedId: "test:theft", tick: 1, knownBy: [] }]);
    expect(npcStanding(state, world, "test:keeper")).toBe(0);
    expect(factionStanding(state, world, "test:guild")).toBe(0);
  });

  it("counts a deed once per faction however many members know", () => {
    const dockersBothKnow = stateWithDeeds([
      { deedId: "test:theft", tick: 1, knownBy: ["test:guard", "test:walker"] },
    ]);
    expect(factionStanding(dockersBothKnow, world, "test:dockers")).toBe(-20);
    expect(factionStanding(dockersBothKnow, world, "test:watch")).toBe(-20);
    expect(factionStanding(dockersBothKnow, world, "test:guild")).toBe(0);
  });

  it("ignores deeds whose definition is unknown", () => {
    const state = stateWithDeeds([{ deedId: "test:ghost", tick: 1, knownBy: ["test:keeper"] }]);
    expect(npcStanding(state, world, "test:keeper")).toBe(0);
  });
});
```

- [x] **Step 2: Run to verify failure** (`pnpm test` — FAIL: old implementations filter on `deed.npcId`/faction membership of the target)

- [x] **Step 3: Rewrite `packages/core/src/reputation.ts`**

```ts
import type { WorldDef } from "./defs.ts";
import type { GameState } from "./state.ts";

/** What this NPC thinks of the player: the sum of deeds they know about. */
export function npcStanding(state: GameState, world: WorldDef, npcId: string): number {
  let standing = 0;
  for (const deed of state.deeds) {
    if (!deed.knownBy.includes(npcId)) {
      continue;
    }
    standing += world.deeds[deed.deedId]?.standingDelta ?? 0;
  }
  return standing;
}

/**
 * What a faction thinks: deeds known by at least one member, counted once
 * per deed. Knowledge reaches members by witnessing or gossip — this
 * replaces M2's instant-faction rule.
 */
export function factionStanding(state: GameState, world: WorldDef, factionId: string): number {
  let standing = 0;
  for (const deed of state.deeds) {
    const known = deed.knownBy.some((npcId) => world.npcs[npcId]?.factionId === factionId);
    if (!known) {
      continue;
    }
    standing += world.deeds[deed.deedId]?.standingDelta ?? 0;
  }
  return standing;
}
```

- [x] **Step 4: Reconcile dependent tests** — `advance.test.ts` and `dialogue.test.ts` scenarios that award dialogue deeds still pass (interlocutor is in `knownBy`, their faction has a knowing member). Any test asserting the M2 instant-faction rule by other means gets updated to the knowledge rule. Run `pnpm test` and fix expectations file by file — semantics, not shapes, are the only edits here.

- [x] **Step 5: Verify pass, full gate, commit**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Compute standing from deed knowledge, not instant faction news"
```

## Task 5: Core — awareness (`awareness.ts`)

**Files:**

- Create: `packages/core/src/awareness.ts`
- Test: `packages/core/src/awareness.test.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Write the failing tests** — `packages/core/src/awareness.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { lineOfSight, perceptionRadius, witnesses } from "./awareness.ts";
import { createGameState } from "./state.ts";
import { fixtureWorld, mapFromAscii } from "./world.fixture.ts";

const world = fixtureWorld();

describe("lineOfSight", () => {
  const map = mapFromAscii(["#####", "#...#", "#.#.#", "#...#", "#####"]);

  it("sees along an open row", () => {
    expect(lineOfSight(map, { x: 1, y: 1 }, { x: 3, y: 1 })).toBe(true);
  });

  it("is blocked by a wall between", () => {
    expect(lineOfSight(map, { x: 1, y: 2 }, { x: 3, y: 2 })).toBe(false);
  });

  it("a wall square on the diagonal blocks sight", () => {
    expect(lineOfSight(map, { x: 1, y: 1 }, { x: 3, y: 3 })).toBe(false);
  });

  it("always sees adjacent tiles", () => {
    expect(lineOfSight(map, { x: 1, y: 1 }, { x: 2, y: 1 })).toBe(true);
    expect(lineOfSight(map, { x: 2, y: 1 }, { x: 3, y: 2 })).toBe(true);
  });
});

describe("perceptionRadius (golden values)", () => {
  it("is 5 by day, 2 at night", () => {
    expect(perceptionRadius(12, false)).toBe(5);
    expect(perceptionRadius(21, false)).toBe(2);
    expect(perceptionRadius(4, false)).toBe(2);
    expect(perceptionRadius(5, false)).toBe(5);
  });

  it("is halved (ceil) while sneaking", () => {
    expect(perceptionRadius(12, true)).toBe(3);
    expect(perceptionRadius(23, true)).toBe(1);
  });
});

describe("witnesses", () => {
  it("the keeper sees the act on the diagonal-adjacent trinket tile", () => {
    const state = createGameState({ seed: 1, world });
    expect(witnesses(state, world, { x: 3, y: 3 })).toEqual(["test:keeper"]);
  });

  it("walls hide the act from the guard and the walker", () => {
    const state = createGameState({ seed: 1, world });
    const seen = witnesses(state, world, { x: 3, y: 3 });
    expect(seen).not.toContain("test:guard");
    expect(seen).not.toContain("test:walker");
  });

  it("everyone in the open street sees the player by day", () => {
    const state = createGameState({ seed: 1, world });
    expect(witnesses(state, world, { x: 5, y: 1 })).toEqual(["test:guard", "test:walker"]);
  });

  it("sneaking shrinks the circle", () => {
    const state = createGameState({ seed: 1, world });
    const sneaking = { ...state, player: { ...state.player, sneaking: true } };
    // radius 3 still covers (5,1)->guard(4,1) and walker(6,1); move out to distance 4
    expect(witnesses(sneaking, world, { x: 1, y: 3 })).toEqual([]);
  });
});
```

(Fixture sight-check: (1,3) to guard (4,1) crosses the solid row-2 wall — blocked; to
keeper (4,4) the line crosses (2,3)…(3,4)? No: (1,3)→(4,4) passes open row-3 tiles, but
Chebyshev distance is 3 ≤ radius 5 unsneaked — hence the test uses sneaking, radius 3,
and the LOS line from keeper (4,4) to (1,3) passes (3,4)/(2,4)? Both are wall row 4 —
blocked either way. The assertion holds for both reasons; the golden value is what's
pinned.)

- [x] **Step 2: Run to verify failure** (`pnpm test` — FAIL: cannot resolve `./awareness.ts`)

- [x] **Step 3: Write `packages/core/src/awareness.ts`**

```ts
import { isBlocked, type MapModel } from "./map.ts";
import type { WorldDef } from "./defs.ts";
import type { GameState, Vec2 } from "./state.ts";
import { hourOf } from "./time.ts";

export const BASE_PERCEPTION = 5;
export const NIGHT_PERCEPTION = 2;
export const NIGHT_STARTS = 21;
export const NIGHT_ENDS = 5;

export function perceptionRadius(hour: number, sneaking: boolean): number {
  const base = hour >= NIGHT_STARTS || hour < NIGHT_ENDS ? NIGHT_PERCEPTION : BASE_PERCEPTION;
  return sneaking ? Math.ceil(base / 2) : base;
}

/**
 * Bresenham line between tile centers; sight is clear when no intermediate
 * tile is blocked (endpoints never block their own line).
 */
export function lineOfSight(map: MapModel, from: Vec2, to: Vec2): boolean {
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - x);
  const dy = -Math.abs(to.y - y);
  const sx = x < to.x ? 1 : -1;
  const sy = y < to.y ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    if (x === to.x && y === to.y) {
      return true;
    }
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y += sy;
    }
    if (x === to.x && y === to.y) {
      return true;
    }
    if (isBlocked(map, x, y)) {
      return false;
    }
  }
}

/** NPC ids (sorted) that can see an act at `at` right now. */
export function witnesses(state: GameState, world: WorldDef, at: Vec2): readonly string[] {
  const radius = perceptionRadius(hourOf(state.tick), state.player.sneaking);
  const seen: string[] = [];
  for (const npc of state.npcs) {
    const distance = Math.max(Math.abs(npc.pos.x - at.x), Math.abs(npc.pos.y - at.y));
    if (distance > radius) {
      continue;
    }
    if (!lineOfSight(world.map, npc.pos, at)) {
      continue;
    }
    seen.push(npc.id);
  }
  return seen.toSorted();
}
```

- [x] **Step 4: Verify pass, export, full gate, commit**

Append to `packages/core/src/index.ts`:

```ts
export {
  BASE_PERCEPTION,
  lineOfSight,
  NIGHT_ENDS,
  NIGHT_PERCEPTION,
  NIGHT_STARTS,
  perceptionRadius,
  witnesses,
} from "./awareness.ts";
```

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Add awareness model: line of sight and perception radius"
```

## Task 6: Core — sneak intent (movement costs double time)

**Files:**

- Modify: `packages/core/src/intent.ts`, `packages/core/src/event.ts`, `packages/core/src/advance.ts`, `packages/core/src/index.ts`, `packages/client/src/world-scene.ts`
- Test: `packages/core/src/advance.test.ts`

- [x] **Step 1: Add failing tests** — append to `packages/core/src/advance.test.ts`:

```ts
describe("advance: sneak", () => {
  it("toggles sneaking without spending time", () => {
    const result = advance(freshState(), { type: "sneak" }, world);
    expect(result.state.player.sneaking).toBe(true);
    expect(result.state.tick).toBe(0);
    expect(result.events).toEqual([{ type: "sneak-toggled", sneaking: true }]);
  });

  it("toggles back off", () => {
    const sneaking = advance(freshState(), { type: "sneak" }, world).state;
    const result = advance(sneaking, { type: "sneak" }, world);
    expect(result.state.player.sneaking).toBe(false);
  });

  it("makes movement cost two ticks", () => {
    const sneaking = advance(freshState(), { type: "sneak" }, world).state;
    const result = advance(sneaking, { type: "move", direction: "south" }, world);
    expect(result.state.tick).toBe(2);
    expect(result.state.player.pos).toEqual({ x: 1, y: 2 });
  });

  it("is rejected mid-conversation", () => {
    const inDialogue = { ...freshState(), dialogue: { npcId: "test:keeper", nodeId: "hello" } };
    const result = advance(inDialogue, { type: "sneak" }, world);
    expect(result.state.player.sneaking).toBe(false);
    expect(result.events[0]?.type).toBe("intent-rejected");
  });
});
```

- [x] **Step 2: Run to verify failure** (`pnpm test` — FAIL: `sneak` is not a valid intent)

- [x] **Step 3: Implement**

`packages/core/src/intent.ts` — append and extend the union:

```ts
export interface SneakIntent {
  readonly type: "sneak";
}
```

```ts
export type Intent = MoveIntent | WaitIntent | TalkIntent | ChooseIntent | SneakIntent;
```

`packages/core/src/event.ts` — append and extend the union:

```ts
export interface SneakToggledEvent {
  readonly type: "sneak-toggled";
  readonly sneaking: boolean;
}
```

`packages/core/src/advance.ts`:

- Give `applyTick` a tick count (sneaking movement passes 2):

```ts
function applyTick(
  state: GameState,
  playerPos: Vec2,
  events: readonly GameEvent[],
  world: WorldDef,
  ticks = 1,
): AdvanceResult {
  let tick = state.tick;
  let npcs = state.npcs;
  const collected: GameEvent[] = [...events];
  for (let step = 0; step < ticks; step += 1) {
    tick += 1;
    const npcResult = advanceNpcs({ npcs, playerPos, world, tick });
    npcs = npcResult.npcs;
    collected.push(...npcResult.events);
  }
  return {
    state: { ...state, tick, player: { ...state.player, pos: playerPos }, npcs },
    events: collected,
  };
}
```

- In `applyMove`, pass the count: both `applyTick(...)` calls gain a final argument
  `state.player.sneaking ? 2 : 1`.
- Add the case and handler:

```ts
    case "sneak":
      return state.dialogue === null && state.trade === null
        ? applySneak(state)
        : rejected(state, "not while you're occupied");
```

```ts
function applySneak(state: GameState): AdvanceResult {
  const sneaking = !state.player.sneaking;
  return {
    state: { ...state, player: { ...state.player, sneaking } },
    events: [{ type: "sneak-toggled", sneaking }],
  };
}
```

- Also guard `move`/`wait` against trade mode (they already reject during dialogue):
  change their conditions to `state.dialogue === null && state.trade === null`, reason
  `"finish what you're doing first"` (update the two existing dialogue-rejection tests'
  expected reasons accordingly — search `finish the conversation first` in
  `advance.test.ts`).

`packages/client/src/world-scene.ts` — `renderEvent` is an exhaustive switch: add
`case "sneak-toggled":` to the trailing no-op group (Task 14 makes it real).

`packages/core/src/index.ts` — add `SneakIntent` to the intent type exports and
`SneakToggledEvent` to the event type exports.

- [x] **Step 4: Verify pass, full gate, commit**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Add sneak toggle: smaller profile, double move cost"
```

## Task 7: Core — theft (`take` intent)

**Files:**

- Modify: `packages/core/src/intent.ts`, `packages/core/src/event.ts`, `packages/core/src/advance.ts`, `packages/core/src/index.ts`, `packages/client/src/world-scene.ts`
- Test: `packages/core/src/advance.test.ts`

- [x] **Step 1: Add failing tests** — append to `packages/core/src/advance.test.ts`:

```ts
// Player (1,1) → the trinket tile (3,3).
const WALK_TO_TRINKET: readonly Intent[] = [
  { type: "move", direction: "south" },
  { type: "move", direction: "south" },
  { type: "move", direction: "east" },
  { type: "move", direction: "east" },
];

describe("advance: take (theft)", () => {
  it("picks up the item underfoot; the keeper witnesses", () => {
    const atTrinket = run(freshState(), WALK_TO_TRINKET);
    const result = advance(atTrinket, { type: "take" }, world);
    expect(result.state.player.items).toEqual(["test:trinket"]);
    expect(result.state.worldItems).toEqual([]);
    expect(result.state.deeds).toEqual([
      { deedId: "test:theft", tick: 4, knownBy: ["test:keeper"] },
    ]);
    expect(result.state.tick).toBe(5);
    expect(result.events).toContainEqual({
      type: "item-taken",
      itemId: "test:trinket",
      at: { x: 3, y: 3 },
    });
    expect(result.events).toContainEqual({
      type: "crime-witnessed",
      deedId: "test:theft",
      witnessIds: ["test:keeper"],
    });
  });

  it("drops standing with everyone who knows", () => {
    const atTrinket = run(freshState(), WALK_TO_TRINKET);
    const result = advance(atTrinket, { type: "take" }, world);
    expect(npcStanding(result.state, world, "test:keeper")).toBe(-20);
    expect(factionStanding(result.state, world, "test:guild")).toBe(-20);
    expect(factionStanding(result.state, world, "test:watch")).toBe(0);
  });

  it("rejects taking where there is nothing", () => {
    const result = advance(freshState(), { type: "take" }, world);
    expect(result.events).toEqual([
      { type: "intent-rejected", reason: "there is nothing here to take" },
    ]);
    expect(result.state.tick).toBe(0);
  });

  it("rejects the verb when the world defines no theft crime", () => {
    const lawless = { ...world, crimes: {} };
    const atTrinket = run(createGameState({ seed: 42, world: lawless }), WALK_TO_TRINKET);
    const result = advance(atTrinket, { type: "take" }, lawless);
    expect(result.events[0]?.type).toBe("intent-rejected");
    expect(result.state.worldItems).toHaveLength(1);
  });
});
```

Add the imports to the top of the file (merge with existing import lines):
`npcStanding`, `factionStanding` from `./reputation.ts`.

- [x] **Step 2: Run to verify failure** (`pnpm test` — FAIL: `take` is not a valid intent)

- [x] **Step 3: Implement**

`packages/core/src/intent.ts`:

```ts
export interface TakeIntent {
  readonly type: "take";
}
```

Add `TakeIntent` to the `Intent` union.

`packages/core/src/event.ts`:

```ts
export interface ItemTakenEvent {
  readonly type: "item-taken";
  readonly itemId: string;
  readonly at: Vec2;
}

export interface CrimeWitnessedEvent {
  readonly type: "crime-witnessed";
  readonly deedId: string;
  readonly witnessIds: readonly string[];
}
```

Add both to the `GameEvent` union.

`packages/core/src/advance.ts` — add the case:

```ts
    case "take":
      return state.dialogue === null && state.trade === null
        ? applyTake(state, world)
        : rejected(state, "not while you're occupied");
```

and the handler (plus `import { witnesses } from "./awareness.ts";`):

```ts
function applyTake(state: GameState, world: WorldDef): AdvanceResult {
  const at = state.player.pos;
  const index = state.worldItems.findIndex((item) => item.pos.x === at.x && item.pos.y === at.y);
  const item = state.worldItems[index];
  if (item === undefined) {
    return rejected(state, "there is nothing here to take");
  }
  const deedId = world.crimes.theft;
  if (deedId === undefined) {
    return rejected(state, "this world knows no law against taking things");
  }
  const knownBy = witnesses(state, world, at);
  const events: GameEvent[] = [{ type: "item-taken", itemId: item.itemId, at }];
  if (knownBy.length > 0) {
    events.push({ type: "crime-witnessed", deedId, witnessIds: knownBy });
  }
  const next: GameState = {
    ...state,
    player: { ...state.player, items: [...state.player.items, item.itemId] },
    worldItems: state.worldItems.filter((_, i) => i !== index),
    deeds: [...state.deeds, { deedId, tick: state.tick, knownBy }],
  };
  return applyTick(next, at, events, world);
}
```

`packages/client/src/world-scene.ts` — add `case "item-taken":` and
`case "crime-witnessed":` to the no-op group.

`packages/core/src/index.ts` — export the new intent/event types.

- [x] **Step 4: Verify pass, full gate, commit**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Add take verb: theft with awareness-based witnesses"
```

## Task 8: Core — pickpocket intent

**Files:**

- Modify: `packages/core/src/intent.ts`, `packages/core/src/event.ts`, `packages/core/src/advance.ts`, `packages/core/src/index.ts`, `packages/client/src/world-scene.ts`
- Test: `packages/core/src/advance.test.ts`

- [x] **Step 1: Add failing tests** — append to `packages/core/src/advance.test.ts`.
      `WALK_TO_KEEPER` already exists in this file from M2 (player (1,1) → (4,3), the tile
      above the keeper's nook) — reuse it, do not redeclare:

```ts
describe("advance: pickpocket", () => {
  function attempt(seed: number) {
    const atKeeper = run(createGameState({ seed, world }), WALK_TO_KEEPER);
    return advance(atKeeper, { type: "pickpocket" }, world);
  }

  it("records the crime deed whatever the outcome, and time passes", () => {
    const result = attempt(1);
    expect(result.state.deeds).toHaveLength(1);
    expect(result.state.deeds[0]?.deedId).toBe("test:pickpocketing");
    expect(result.state.tick).toBe(6);
    expect(result.state.rng).not.toBe(createGameState({ seed: 1, world }).rng);
  });

  it("on success the pearl moves and the victim does not know", () => {
    for (let seed = 1; seed < 50; seed += 1) {
      const result = attempt(seed);
      if (result.state.player.items.includes("test:pearl")) {
        expect(result.state.npcs.find((npc) => npc.id === "test:keeper")?.pockets).toEqual([]);
        expect(result.state.deeds[0]?.knownBy).toEqual([]);
        expect(result.events).toContainEqual({
          type: "pickpocket-succeeded",
          npcId: "test:keeper",
          itemId: "test:pearl",
        });
        return;
      }
    }
    expect.unreachable("no successful pickpocket in 50 seeds");
  });

  it("on failure the victim knows and keeps the pearl", () => {
    for (let seed = 1; seed < 50; seed += 1) {
      const result = attempt(seed);
      if (!result.state.player.items.includes("test:pearl")) {
        expect(result.state.npcs.find((npc) => npc.id === "test:keeper")?.pockets).toEqual([
          "test:pearl",
        ]);
        expect(result.state.deeds[0]?.knownBy).toContain("test:keeper");
        expect(result.events).toContainEqual({
          type: "pickpocket-failed",
          npcId: "test:keeper",
        });
        return;
      }
    }
    expect.unreachable("no failed pickpocket in 50 seeds");
  });

  it("is deterministic for a given seed", () => {
    expect(attempt(7).state).toEqual(attempt(7).state);
  });

  it("rejects empty pockets without spending time or rng", () => {
    const state = run(freshState(), [
      { type: "move", direction: "east" },
      { type: "move", direction: "east" },
      { type: "move", direction: "east" },
    ]); // (4,1) is the guard's tile; player ends at (3,1), guard adjacent east — pockets empty
    const result = advance(state, { type: "pickpocket" }, world);
    expect(result.events[0]?.type).toBe("intent-rejected");
    expect(result.state.tick).toBe(state.tick);
  });
});
```

- [x] **Step 2: Run to verify failure** (`pnpm test` — FAIL: `pickpocket` is not a valid intent)

- [x] **Step 3: Implement**

`packages/core/src/intent.ts`:

```ts
export interface PickpocketIntent {
  readonly type: "pickpocket";
}
```

Add to the `Intent` union.

`packages/core/src/event.ts`:

```ts
export interface PickpocketSucceededEvent {
  readonly type: "pickpocket-succeeded";
  readonly npcId: string;
  readonly itemId: string;
}

export interface PickpocketFailedEvent {
  readonly type: "pickpocket-failed";
  readonly npcId: string;
}
```

Add both to the `GameEvent` union.

`packages/core/src/advance.ts` — case:

```ts
    case "pickpocket":
      return state.dialogue === null && state.trade === null
        ? applyPickpocket(state, world)
        : rejected(state, "not while you're occupied");
```

handler (plus `import { nextFloat } from "./rng.ts";`):

```ts
const PICKPOCKET_CHANCE = 0.5;
const PICKPOCKET_SNEAK_CHANCE = 0.8;

function applyPickpocket(state: GameState, world: WorldDef): AdvanceResult {
  const victim = adjacentNpc(state);
  if (victim === undefined) {
    return rejected(state, "no one within reach");
  }
  const deedId = world.crimes.pickpocket;
  if (deedId === undefined) {
    return rejected(state, "this world knows no law against light fingers");
  }
  const itemId = victim.pockets[0];
  if (itemId === undefined) {
    return rejected(state, "their pockets are empty");
  }

  const roll = nextFloat(state.rng);
  const chance = state.player.sneaking ? PICKPOCKET_SNEAK_CHANCE : PICKPOCKET_CHANCE;
  const bystanders = witnesses(state, world, state.player.pos);
  const events: GameEvent[] = [];
  let player = state.player;
  let npcs = state.npcs;
  let knownBy: readonly string[];
  if (roll.value < chance) {
    knownBy = bystanders.filter((id) => id !== victim.id);
    player = { ...player, items: [...player.items, itemId] };
    npcs = npcs.map((npc) =>
      npc.id === victim.id ? { ...npc, pockets: npc.pockets.slice(1) } : npc,
    );
    events.push({ type: "pickpocket-succeeded", npcId: victim.id, itemId });
  } else {
    knownBy = [...new Set([...bystanders, victim.id])].toSorted();
    events.push({ type: "pickpocket-failed", npcId: victim.id });
  }
  if (knownBy.length > 0) {
    events.push({ type: "crime-witnessed", deedId, witnessIds: knownBy });
  }
  const next: GameState = {
    ...state,
    rng: roll.state,
    player,
    npcs,
    deeds: [...state.deeds, { deedId, npcId: victim.id, tick: state.tick, knownBy }],
  };
  return applyTick(next, state.player.pos, events, world);
}
```

`packages/client/src/world-scene.ts` — add `case "pickpocket-succeeded":` and
`case "pickpocket-failed":` to the no-op group.

`packages/core/src/index.ts` — export the new intent/event types.

- [x] **Step 4: Extend the determinism property test** — in `advance.test.ts`, find the
      fast-check property that runs random intent sequences and add the new verbs to its
      `constantFrom(...)` pool: `{ type: "sneak" }, { type: "take" }, { type: "pickpocket" }`.
      Same seed + same intents must still produce identical states.

- [x] **Step 5: Verify pass, full gate, commit**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Add pickpocket verb: rng roll, victims, bystander witnesses"
```

## Task 9: Core — gossip propagation

**Files:**

- Create: `packages/core/src/gossip.ts`
- Test: `packages/core/src/gossip.test.ts`
- Modify: `packages/core/src/event.ts`, `packages/core/src/advance.ts`, `packages/core/src/index.ts`, `packages/client/src/world-scene.ts`
- Test: `packages/core/src/advance.test.ts`

- [x] **Step 1: Write the failing tests** — `packages/core/src/gossip.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { spreadGossip } from "./gossip.ts";
import type { DeedRecord, NpcState } from "./state.ts";
import { fixtureWorld } from "./world.fixture.ts";

const world = fixtureWorld();

function npc(id: string, x: number, y: number): NpcState {
  return { id, pos: { x, y }, pockets: [] };
}

const theft: DeedRecord = { deedId: "test:theft", tick: 1, knownBy: ["test:keeper"] };

describe("spreadGossip", () => {
  it("shares knowledge between NPCs in conversation range", () => {
    const npcs = [npc("test:keeper", 4, 4), npc("test:walker", 4, 3)];
    const result = spreadGossip({ deeds: [theft], npcs, map: world.map });
    expect(result.deeds[0]?.knownBy).toEqual(["test:keeper", "test:walker"]);
    expect(result.events).toEqual([
      {
        type: "gossip-shared",
        fromNpcId: "test:keeper",
        toNpcId: "test:walker",
        deedId: "test:theft",
      },
    ]);
  });

  it("does not gossip through walls", () => {
    // keeper (4,4) and guard (4,1): distance 3 and walled off — no exchange
    const npcs = [npc("test:keeper", 4, 4), npc("test:guard", 4, 1)];
    const result = spreadGossip({ deeds: [theft], npcs, map: world.map });
    expect(result.deeds[0]?.knownBy).toEqual(["test:keeper"]);
    expect(result.events).toEqual([]);
  });

  it("does nothing when everyone already knows", () => {
    const both: DeedRecord = { ...theft, knownBy: ["test:keeper", "test:walker"] };
    const npcs = [npc("test:keeper", 4, 4), npc("test:walker", 4, 3)];
    const result = spreadGossip({ deeds: [both], npcs, map: world.map });
    expect(result.deeds).toEqual([both]);
    expect(result.events).toEqual([]);
  });

  it("chains within a single tick along a crowd", () => {
    // a knows; b within range of a; c within range of b but not a.
    const npcs = [npc("test:keeper", 1, 3), npc("test:walker", 3, 3), npc("test:guard", 5, 3)];
    const result = spreadGossip({ deeds: [theft], npcs, map: world.map });
    expect(result.deeds[0]?.knownBy).toEqual(["test:guard", "test:keeper", "test:walker"]);
  });
});
```

And append the end-to-end scenario to `packages/core/src/advance.test.ts`:

```ts
describe("gossip carries consequences across factions", () => {
  it("the walker learns of the theft while passing the keeper", () => {
    const intents: Intent[] = [
      ...WALK_TO_TRINKET,
      { type: "take" },
      { type: "move", direction: "west" },
      { type: "move", direction: "west" },
      { type: "move", direction: "north" },
      { type: "move", direction: "north" },
      ...Array.from({ length: 15 }, (): Intent => ({ type: "wait" })),
    ];
    const { state } = runScenario({ world, seed: 3, intents });
    const theft = state.deeds.find((deed) => deed.deedId === "test:theft");
    expect(theft?.knownBy).toContain("test:walker");
    expect(factionStanding(state, world, "test:dockers")).toBe(-20);
  });
});
```

(Add `runScenario` to the imports from `./harness.ts`. Timeline: the theft happens at
tick 4; at hour 9 — tick 10 — the walker commutes from `a` (6,1) to `b` (1,3) via the
east corridor and row 3, passing (4,3), one tile from the keeper (4,4): gossip fires.
The player has returned to (1,1), clear of the walker's destination.)

- [x] **Step 2: Run to verify failure** (`pnpm test` — FAIL: cannot resolve `./gossip.ts`)

- [x] **Step 3: Write `packages/core/src/gossip.ts`**

```ts
import { lineOfSight } from "./awareness.ts";
import type { GameEvent } from "./event.ts";
import type { MapModel } from "./map.ts";
import type { DeedRecord, NpcState } from "./state.ts";

export const GOSSIP_RANGE = 2;

/**
 * One gossip pass: every NPC pair in conversation range (Chebyshev ≤ 2 with
 * line of sight) merges deed knowledge, both directions. Deterministic: pairs
 * in array order, knownBy kept sorted. Knowledge travels because schedules
 * co-locate people — no rates, no rng.
 */
export function spreadGossip(options: {
  readonly deeds: readonly DeedRecord[];
  readonly npcs: readonly NpcState[];
  readonly map: MapModel;
}): { readonly deeds: readonly DeedRecord[]; readonly events: readonly GameEvent[] } {
  const { npcs, map } = options;
  const events: GameEvent[] = [];
  const known = options.deeds.map((deed) => new Set(deed.knownBy));

  for (const [i, a] of npcs.entries()) {
    for (const b of npcs.slice(i + 1)) {
      const distance = Math.max(Math.abs(a.pos.x - b.pos.x), Math.abs(a.pos.y - b.pos.y));
      if (distance > GOSSIP_RANGE || !lineOfSight(map, a.pos, b.pos)) {
        continue;
      }
      options.deeds.forEach((deed, index) => {
        const set = known[index];
        if (set === undefined) {
          return;
        }
        if (set.has(a.id) && !set.has(b.id)) {
          set.add(b.id);
          events.push({
            type: "gossip-shared",
            fromNpcId: a.id,
            toNpcId: b.id,
            deedId: deed.deedId,
          });
        } else if (set.has(b.id) && !set.has(a.id)) {
          set.add(a.id);
          events.push({
            type: "gossip-shared",
            fromNpcId: b.id,
            toNpcId: a.id,
            deedId: deed.deedId,
          });
        }
      });
    }
  }

  if (events.length === 0) {
    return { deeds: options.deeds, events };
  }
  const deeds = options.deeds.map((deed, index) => {
    const set = known[index];
    if (set === undefined || set.size === deed.knownBy.length) {
      return deed;
    }
    return { ...deed, knownBy: [...set].toSorted() };
  });
  return { deeds, events };
}
```

(The chain test passes because pairs are processed in order: (keeper,walker) shares,
then (walker,guard) shares onward — one tick, one crowd, whole rumor. Chebyshev 2
between (1,3)/(3,3) and (3,3)/(5,3), row 3 is open.)

`packages/core/src/event.ts`:

```ts
export interface GossipSharedEvent {
  readonly type: "gossip-shared";
  readonly fromNpcId: string;
  readonly toNpcId: string;
  readonly deedId: string;
}
```

Add to the `GameEvent` union.

- [x] **Step 4: Wire into `applyTick`** — in `packages/core/src/advance.ts`, inside the
      per-tick loop after NPC movement:

```ts
let deeds = state.deeds;
for (let step = 0; step < ticks; step += 1) {
  tick += 1;
  const npcResult = advanceNpcs({ npcs, playerPos, world, tick });
  npcs = npcResult.npcs;
  collected.push(...npcResult.events);
  const gossip = spreadGossip({ deeds, npcs, map: world.map });
  deeds = gossip.deeds;
  collected.push(...gossip.events);
}
```

and include `deeds` in the returned state. Import `spreadGossip` from `./gossip.ts`.

`packages/client/src/world-scene.ts` — add `case "gossip-shared":` to the no-op group.

`packages/core/src/index.ts`:

```ts
export { GOSSIP_RANGE, spreadGossip } from "./gossip.ts";
```

and add `GossipSharedEvent` to the event type exports.

- [x] **Step 5: Verify pass, full gate, commit**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Spread deed knowledge between NPCs in conversation range"
```

## Task 10: Core — coin dialogue vocabulary and guard confrontation

**Files:**

- Modify: `packages/core/src/dialogue.ts`, `packages/core/src/advance.ts`, `packages/core/src/event.ts`, `packages/core/src/index.ts`, `packages/client/src/world-scene.ts`
- Test: `packages/core/src/dialogue.test.ts`, `packages/core/src/advance.test.ts`

- [x] **Step 1: Add failing tests**

Append to `packages/core/src/dialogue.test.ts`:

```ts
describe("coin-at-least condition", () => {
  it("hides the fine choice until the player can pay", () => {
    const broke = {
      ...createGameState({ seed: 1, world }),
      player: { ...createGameState({ seed: 1, world }).player, coin: 5 },
      dialogue: { npcId: "test:guard", nodeId: "halt" },
    };
    expect(visibleChoices(broke, world).map((choice) => choice.text)).toEqual([
      "I owe you nothing",
    ]);
    const solvent = { ...broke, player: { ...broke.player, coin: 20 } };
    expect(visibleChoices(solvent, world).map((choice) => choice.text)).toEqual([
      "Pay 20 coin",
      "I owe you nothing",
    ]);
  });
});
```

Append to `packages/core/src/advance.test.ts`:

```ts
describe("guard confrontation and fines", () => {
  function hostileToGuard(): GameState {
    const fresh = freshState();
    return {
      ...fresh,
      deeds: [{ deedId: "test:theft", tick: 0, knownBy: ["test:guard"] }],
    };
  }

  it("the guard forces dialogue when adjacent and they know", () => {
    // (3,1) is adjacent to the guard at (4,1).
    const result = run(hostileToGuard(), [
      { type: "move", direction: "east" },
      { type: "move", direction: "east" },
    ]);
    expect(result.dialogue).toEqual({ npcId: "test:guard", nodeId: "halt" });
  });

  it("does not confront when the guard knows nothing", () => {
    const result = run(freshState(), [
      { type: "move", direction: "east" },
      { type: "move", direction: "east" },
    ]);
    expect(result.dialogue).toBeNull();
  });

  it("paying the fine costs coin and squares you with the guard", () => {
    const confronted = run(hostileToGuard(), [
      { type: "move", direction: "east" },
      { type: "move", direction: "east" },
    ]);
    const result = advance(confronted, { type: "choose", index: 0 }, world);
    expect(result.state.player.coin).toBe(0);
    expect(result.state.dialogue).toBeNull();
    expect(npcStanding(result.state, world, "test:guard")).toBe(5);
    expect(result.events).toContainEqual({ type: "coin-paid", amount: 20, npcId: "test:guard" });
  });

  it("after paying, walking beside the guard is safe again", () => {
    const confronted = run(hostileToGuard(), [
      { type: "move", direction: "east" },
      { type: "move", direction: "east" },
    ]);
    const paid = advance(confronted, { type: "choose", index: 0 }, world).state;
    const result = advance(paid, { type: "wait" }, world);
    expect(result.state.dialogue).toBeNull();
  });

  it("a choice whose pay exceeds coin is rejected atomically", () => {
    const confronted = run(hostileToGuard(), [
      { type: "move", direction: "east" },
      { type: "move", direction: "east" },
    ]);
    const broke = { ...confronted, player: { ...confronted.player, coin: 20 } };
    // Manufacture a state where the visible choice demands more than we have:
    const poorer = { ...broke, player: { ...broke.player, coin: 0 } };
    const result = advance(poorer, { type: "choose", index: 0 }, world);
    // coin 0 hides "Pay 20 coin"; index 0 is now "I owe you nothing" — deed lands, no pay
    expect(result.state.player.coin).toBe(0);
    expect(result.state.deeds.some((deed) => deed.deedId === "test:defied")).toBe(true);
  });
});
```

- [x] **Step 2: Run to verify failure** (`pnpm test` — FAIL: `coin-at-least` unhandled in `conditionMet`, no confrontation, no pay effect)

- [x] **Step 3: Implement**

`packages/core/src/dialogue.ts` — add to `conditionMet`'s switch:

```ts
    case "coin-at-least":
      return state.player.coin >= condition.value;
```

`packages/core/src/event.ts`:

```ts
export interface CoinPaidEvent {
  readonly type: "coin-paid";
  readonly amount: number;
  readonly npcId: string;
}
```

Add to the `GameEvent` union.

`packages/core/src/advance.ts`:

1. In `applyChoose`, handle both effect kinds atomically. Replace the effects loop with:

```ts
const events: GameEvent[] = [];
const effects = choice.effects ?? [];
const totalPay = effects.reduce(
  (sum, effect) => (effect.type === "pay" ? sum + effect.amount : sum),
  0,
);
if (totalPay > state.player.coin) {
  return rejected(state, "you cannot pay that");
}
let deeds = state.deeds;
for (const effect of effects) {
  if (effect.type === "deed") {
    deeds = [...deeds, { deedId: effect.deedId, npcId, tick: state.tick, knownBy: [npcId] }];
    events.push({ type: "deed-recorded", deedId: effect.deedId, npcId });
  } else {
    events.push({ type: "coin-paid", amount: effect.amount, npcId });
  }
}
const player =
  totalPay === 0 ? state.player : { ...state.player, coin: state.player.coin - totalPay };
const withDeeds: GameState = { ...state, player, deeds };
```

(The rest of `applyChoose` — reputation event, `next` handling — is unchanged but now
spreads `withDeeds` which carries the reduced coin.)

2. Confrontation check at the end of `applyTick`, after the per-tick loop, before `return`:

```ts
const next: GameState = {
  ...state,
  tick,
  player: { ...state.player, pos: playerPos },
  npcs,
  deeds,
};
const confronter = findConfronter(next, world);
if (confronter !== undefined) {
  const dialogue = world.dialogues[confronter.dialogueId];
  if (dialogue !== undefined) {
    collected.push({ type: "dialogue-started", npcId: confronter.npcId, nodeId: dialogue.start });
    return {
      state: { ...next, dialogue: { npcId: confronter.npcId, nodeId: dialogue.start } },
      events: collected,
    };
  }
}
return { state: next, events: collected };
```

with the helper (import `npcStanding` is already there):

```ts
function findConfronter(
  state: GameState,
  world: WorldDef,
): { npcId: string; dialogueId: string } | undefined {
  for (const npc of state.npcs) {
    const confront = world.npcs[npc.id]?.confront;
    if (confront === undefined) {
      continue;
    }
    const distance = Math.max(
      Math.abs(npc.pos.x - state.player.pos.x),
      Math.abs(npc.pos.y - state.player.pos.y),
    );
    if (distance > 1) {
      continue;
    }
    if (npcStanding(state, world, npc.id) < confront.standingBelow) {
      return { npcId: npc.id, dialogueId: confront.dialogueId };
    }
  }
  return undefined;
}
```

`packages/client/src/world-scene.ts` — add `case "coin-paid":` to the no-op group.

`packages/core/src/index.ts` — add `CoinPaidEvent` to the event type exports.

- [x] **Step 4: Verify pass, full gate, commit**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Add fines: coin condition, pay effect, guard confrontation"
```

## Task 11: Core — trade (prices as consequences)

**Files:**

- Create: `packages/core/src/trade.ts`
- Test: `packages/core/src/trade.test.ts`
- Modify: `packages/core/src/intent.ts`, `packages/core/src/event.ts`, `packages/core/src/advance.ts`, `packages/core/src/index.ts`, `packages/client/src/world-scene.ts`
- Test: `packages/core/src/advance.test.ts`

- [x] **Step 1: Write the failing price tests** — `packages/core/src/trade.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buyPrice, sellPrice, tradeRefused } from "./trade.ts";
import { createGameState, type GameState } from "./state.ts";
import { fixtureWorld } from "./world.fixture.ts";

const world = fixtureWorld();

// The keeper (test:guild) sells test:trinket (value 10); test:pearl is value 15.
function withGuildStanding(delta: number): GameState {
  const state = createGameState({ seed: 1, world });
  if (delta === 0) {
    return state;
  }
  const deedId = delta > 0 ? "test:praise" : "test:slight";
  const count = Math.abs(delta) / 10;
  return {
    ...state,
    deeds: Array.from({ length: count }, (_, tick) => ({
      deedId,
      npcId: "test:keeper",
      tick,
      knownBy: ["test:keeper"],
    })),
  };
}

describe("trade prices track faction standing (golden values)", () => {
  it("neutral: face value buy, half value sell", () => {
    const state = withGuildStanding(0);
    expect(tradeRefused(state, world, "test:keeper")).toBe(false);
    expect(buyPrice(state, world, "test:keeper", "test:trinket")).toBe(10);
    expect(sellPrice(state, world, "test:keeper", "test:pearl")).toBe(7);
  });

  it("wary (below 0): markup and lowball", () => {
    const state = withGuildStanding(-10);
    expect(tradeRefused(state, world, "test:keeper")).toBe(false);
    expect(buyPrice(state, world, "test:keeper", "test:trinket")).toBe(15);
    expect(sellPrice(state, world, "test:keeper", "test:pearl")).toBe(3);
  });

  it("hostile (-20 and below): refuses outright", () => {
    expect(tradeRefused(withGuildStanding(-20), world, "test:keeper")).toBe(true);
  });

  it("friendly (25 and up): discount and fair offers", () => {
    const state = withGuildStanding(30);
    expect(buyPrice(state, world, "test:keeper", "test:trinket")).toBe(8);
    expect(sellPrice(state, world, "test:keeper", "test:pearl")).toBe(9);
  });

  it("returns undefined for an unknown item", () => {
    const state = withGuildStanding(0);
    expect(buyPrice(state, world, "test:keeper", "test:ghost")).toBeUndefined();
  });
});
```

- [x] **Step 2: Run to verify failure** (`pnpm test` — FAIL: cannot resolve `./trade.ts`)

- [x] **Step 3: Write `packages/core/src/trade.ts`**

```ts
import type { WorldDef } from "./defs.ts";
import { factionStanding } from "./reputation.ts";
import type { GameState } from "./state.ts";

export const TRADE_REFUSE_AT = -20;
export const TRADE_FRIENDLY_AT = 25;

interface PriceBand {
  readonly buy: number;
  readonly sell: number;
}

const WARY: PriceBand = { buy: 1.5, sell: 0.25 };
const NORMAL: PriceBand = { buy: 1, sell: 0.5 };
const FRIENDLY: PriceBand = { buy: 0.8, sell: 0.6 };

function band(state: GameState, world: WorldDef, npcId: string): PriceBand {
  const factionId = world.npcs[npcId]?.factionId;
  const standing = factionId === undefined ? 0 : factionStanding(state, world, factionId);
  if (standing >= TRADE_FRIENDLY_AT) {
    return FRIENDLY;
  }
  if (standing < 0) {
    return WARY;
  }
  return NORMAL;
}

/** Prices are a consequence: the shopkeeper's faction remembers (spec §4.3). */
export function tradeRefused(state: GameState, world: WorldDef, npcId: string): boolean {
  const factionId = world.npcs[npcId]?.factionId;
  if (factionId === undefined) {
    return true;
  }
  return factionStanding(state, world, factionId) <= TRADE_REFUSE_AT;
}

export function buyPrice(
  state: GameState,
  world: WorldDef,
  npcId: string,
  itemId: string,
): number | undefined {
  const value = world.items[itemId]?.value;
  return value === undefined ? undefined : Math.ceil(value * band(state, world, npcId).buy);
}

export function sellPrice(
  state: GameState,
  world: WorldDef,
  npcId: string,
  itemId: string,
): number | undefined {
  const value = world.items[itemId]?.value;
  return value === undefined ? undefined : Math.floor(value * band(state, world, npcId).sell);
}
```

- [x] **Step 4: Verify the price tests pass** (`pnpm test`)

- [x] **Step 5: Add failing intent tests** — append to `packages/core/src/advance.test.ts`:

```ts
describe("advance: trade", () => {
  // (4,3) is adjacent to the keeper, who runs the fixture shop.
  function trading(): GameState {
    const atKeeper = run(freshState(), WALK_TO_KEEPER);
    return advance(atKeeper, { type: "trade" }, world).state;
  }

  it("opens and closes trade with the adjacent shopkeeper, costing no time", () => {
    const atKeeper = run(freshState(), WALK_TO_KEEPER);
    const opened = advance(atKeeper, { type: "trade" }, world);
    expect(opened.state.trade).toEqual({ npcId: "test:keeper" });
    expect(opened.state.tick).toBe(atKeeper.tick);
    expect(opened.events).toEqual([{ type: "trade-started", npcId: "test:keeper" }]);
    const closed = advance(opened.state, { type: "close-trade" }, world);
    expect(closed.state.trade).toBeNull();
    expect(closed.events).toEqual([{ type: "trade-ended", npcId: "test:keeper" }]);
  });

  it("buys from stock: coin down, item gained", () => {
    const result = advance(trading(), { type: "buy", index: 0 }, world);
    expect(result.state.player.coin).toBe(10);
    expect(result.state.player.items).toEqual(["test:trinket"]);
    expect(result.events).toContainEqual({
      type: "item-bought",
      itemId: "test:trinket",
      price: 10,
    });
  });

  it("sells from the bag: item gone, coin up", () => {
    const bought = advance(trading(), { type: "buy", index: 0 }, world).state;
    const result = advance(bought, { type: "sell", index: 0 }, world);
    expect(result.state.player.items).toEqual([]);
    expect(result.state.player.coin).toBe(15);
    expect(result.events).toContainEqual({
      type: "item-sold",
      itemId: "test:trinket",
      price: 5,
    });
  });

  it("rejects buying beyond your purse", () => {
    const broke = { ...trading(), player: { ...trading().player, coin: 3 } };
    const result = advance(broke, { type: "buy", index: 0 }, world);
    expect(result.events[0]?.type).toBe("intent-rejected");
    expect(result.state.player.items).toEqual([]);
  });

  it("a hostile shopkeeper refuses to open trade at all", () => {
    const atKeeper = run(freshState(), WALK_TO_KEEPER);
    const hated = {
      ...atKeeper,
      deeds: [{ deedId: "test:theft", tick: 0, knownBy: ["test:keeper"] }],
    };
    const result = advance(hated, { type: "trade" }, world);
    expect(result.state.trade).toBeNull();
    expect(result.events[0]?.type).toBe("intent-rejected");
  });

  it("rejects trading with someone who keeps no shop", () => {
    const atGuard = run(freshState(), [
      { type: "move", direction: "east" },
      { type: "move", direction: "east" },
    ]);
    const result = advance(atGuard, { type: "trade" }, world);
    expect(result.events[0]?.type).toBe("intent-rejected");
  });

  it("movement is rejected while trading", () => {
    const result = advance(trading(), { type: "move", direction: "north" }, world);
    expect(result.events[0]?.type).toBe("intent-rejected");
    expect(result.state.tick).toBe(trading().tick);
  });
});
```

- [x] **Step 6: Run to verify failure**, then implement

`packages/core/src/intent.ts`:

```ts
export interface TradeIntent {
  readonly type: "trade";
}

export interface BuyIntent {
  readonly type: "buy";
  readonly index: number;
}

export interface SellIntent {
  readonly type: "sell";
  readonly index: number;
}

export interface CloseTradeIntent {
  readonly type: "close-trade";
}
```

Add all four to the `Intent` union.

`packages/core/src/event.ts`:

```ts
export interface TradeStartedEvent {
  readonly type: "trade-started";
  readonly npcId: string;
}

export interface TradeEndedEvent {
  readonly type: "trade-ended";
  readonly npcId: string;
}

export interface ItemBoughtEvent {
  readonly type: "item-bought";
  readonly itemId: string;
  readonly price: number;
}

export interface ItemSoldEvent {
  readonly type: "item-sold";
  readonly itemId: string;
  readonly price: number;
}
```

Add all four to the `GameEvent` union.

`packages/core/src/advance.ts` — cases:

```ts
    case "trade":
      return state.dialogue === null && state.trade === null
        ? applyTradeOpen(state, world)
        : rejected(state, "not while you're occupied");
    case "buy":
      return applyBuy(state, intent, world);
    case "sell":
      return applySell(state, intent, world);
    case "close-trade":
      return state.trade === null
        ? rejected(state, "you are not trading")
        : {
            state: { ...state, trade: null },
            events: [{ type: "trade-ended", npcId: state.trade.npcId }],
          };
```

handlers (import `buyPrice`, `sellPrice`, `tradeRefused` from `./trade.ts`):

```ts
function applyTradeOpen(state: GameState, world: WorldDef): AdvanceResult {
  const npc = adjacentNpc(state);
  const def = npc === undefined ? undefined : world.npcs[npc.id];
  if (npc === undefined || def?.shop === undefined) {
    return rejected(state, "no one within reach keeps a shop");
  }
  if (tradeRefused(state, world, npc.id)) {
    return rejected(state, `${def.name} wants nothing to do with you`);
  }
  return {
    state: { ...state, trade: { npcId: npc.id } },
    events: [{ type: "trade-started", npcId: npc.id }],
  };
}

function applyBuy(state: GameState, intent: BuyIntent, world: WorldDef): AdvanceResult {
  if (state.trade === null) {
    return rejected(state, "you are not trading");
  }
  const npcId = state.trade.npcId;
  const itemId = world.npcs[npcId]?.shop?.sells[intent.index];
  const price = itemId === undefined ? undefined : buyPrice(state, world, npcId, itemId);
  if (itemId === undefined || price === undefined) {
    return rejected(state, `there is no ware ${intent.index}`);
  }
  if (price > state.player.coin) {
    return rejected(state, "you cannot afford that");
  }
  return {
    state: {
      ...state,
      player: {
        ...state.player,
        coin: state.player.coin - price,
        items: [...state.player.items, itemId],
      },
    },
    events: [{ type: "item-bought", itemId, price }],
  };
}

function applySell(state: GameState, intent: SellIntent, world: WorldDef): AdvanceResult {
  if (state.trade === null) {
    return rejected(state, "you are not trading");
  }
  const itemId = state.player.items[intent.index];
  const price =
    itemId === undefined ? undefined : sellPrice(state, world, state.trade.npcId, itemId);
  if (itemId === undefined || price === undefined) {
    return rejected(state, `you carry no item ${intent.index}`);
  }
  return {
    state: {
      ...state,
      player: {
        ...state.player,
        coin: state.player.coin + price,
        items: state.player.items.filter((_, i) => i !== intent.index),
      },
    },
    events: [{ type: "item-sold", itemId, price }],
  };
}
```

Also update `applyTalk` to refuse during trade (`state.trade !== null` → rejected).

`packages/client/src/world-scene.ts` — add `case "trade-started":`,
`case "trade-ended":`, `case "item-bought":`, `case "item-sold":` to the no-op group.

`packages/core/src/index.ts`:

```ts
export { buyPrice, sellPrice, TRADE_FRIENDLY_AT, TRADE_REFUSE_AT, tradeRefused } from "./trade.ts";
```

plus the new intent/event types in their blocks.

- [x] **Step 7: Verify pass, full gate, commit**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Add buy/sell trade with standing-driven price bands"
```

## Task 12: Content — schemas and link pass for items, crimes, NPC extensions

**Files:**

- Modify: `packages/content/src/schemas.ts`, `packages/content/src/finalize.ts`
- Test: `packages/content/src/loader.test.ts`, `packages/content/src/finalize.test.ts`

- [x] **Step 1: Add failing schema tests** — append to `packages/content/src/loader.test.ts`:

```ts
describe("item and crime objects", () => {
  it("parses an item", () => {
    const objects = parsePackObjects(
      [{ type: "item", id: "base:cutlass", name: "Cutlass", value: 30 }],
      "items.json",
    );
    expect(objects[0]).toMatchObject({ type: "item", value: 30 });
  });

  it("rejects a negative value", () => {
    expect(() =>
      parsePackObjects([{ type: "item", id: "base:iou", name: "IOU", value: -1 }], "items.json"),
    ).toThrow(ContentError);
  });

  it("parses a crime", () => {
    const objects = parsePackObjects(
      [{ type: "crime", id: "base:theft_law", verb: "theft", deed: "base:theft" }],
      "crimes.json",
    );
    expect(objects[0]).toMatchObject({ type: "crime", verb: "theft" });
  });

  it("rejects an unknown crime verb", () => {
    expect(() =>
      parsePackObjects(
        [{ type: "crime", id: "base:arson_law", verb: "arson", deed: "base:arson" }],
        "crimes.json",
      ),
    ).toThrow(ContentError);
  });

  it("parses npc pockets, shop, and confront", () => {
    const objects = parsePackObjects(
      [
        {
          type: "npc",
          id: "base:fence",
          name: "Fence",
          faction: "base:merchants_guild",
          dialogue: "base:fence_talk",
          schedule: [{ hour: 0, location: "den" }],
          pockets: ["base:cutlass"],
          shop: { sells: ["base:cutlass"] },
          confront: { standingBelow: -10, dialogue: "base:fence_confront" },
        },
      ],
      "npcs.json",
    );
    expect(objects[0]).toMatchObject({ pockets: ["base:cutlass"] });
  });

  it("defaults pockets to empty", () => {
    const objects = parsePackObjects(
      [
        {
          type: "npc",
          id: "base:monk",
          name: "Monk",
          faction: "base:merchants_guild",
          dialogue: "base:monk_talk",
          schedule: [{ hour: 0, location: "chapel" }],
        },
      ],
      "npcs.json",
    );
    expect(objects[0]).toMatchObject({ pockets: [] });
  });

  it("parses pay effects and coin conditions in dialogue", () => {
    const objects = parsePackObjects(
      [
        {
          type: "dialogue",
          id: "base:toll",
          start: "pay",
          nodes: {
            pay: {
              text: "Toll.",
              choices: [
                {
                  text: "Pay 5",
                  condition: { type: "coin-at-least", value: 5 },
                  effects: [{ type: "pay", amount: 5 }],
                },
                { text: "Walk away" },
              ],
            },
          },
        },
      ],
      "dialogues.json",
    );
    expect(objects[0]?.type).toBe("dialogue");
  });
});
```

(Match the file's existing import style; add `ContentError` if not imported.)

- [x] **Step 2: Run to verify failure** (`pnpm test` — FAIL: unrecognized `item`/`crime` types
      and `pockets`/`shop`/`confront`/`coin-at-least`/`pay` fields), then extend
      `packages/content/src/schemas.ts`

```ts
export const itemSchema = z.strictObject({
  type: z.literal("item"),
  id: objectId,
  name: z.string().min(1),
  value: z.number().int().min(0),
});

export const crimeSchema = z.strictObject({
  type: z.literal("crime"),
  id: objectId,
  verb: z.enum(["pickpocket", "theft"]),
  deed: objectId,
});
```

Extend `npcSchema` with:

```ts
  pockets: z.array(objectId).default([]),
  shop: z.strictObject({ sells: z.array(objectId).min(1) }).optional(),
  confront: z
    .strictObject({ standingBelow: z.number().int(), dialogue: objectId })
    .optional(),
```

Extend `conditionSchema`'s enum with `"coin-at-least"`. Replace `effectSchema` with a
discriminated union:

```ts
const effectSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("deed"), deed: objectId }),
  z.strictObject({ type: z.literal("pay"), amount: z.number().int().min(1) }),
]);
```

Add `itemSchema` and `crimeSchema` to `packObjectSchema`'s union and export
`ItemObject`/`CrimeObject` inferred types alongside the others.

- [x] **Step 3: Add failing link-pass tests** — appended to `packages/content/src/finalize.test.ts`,
      using the file's existing `objects()`/`map` helpers (the npc entry in `objects()` needed an
      explicit `pockets: []` added, since these fixtures build `PackObject`s directly rather than
      through the zod default):

```ts
describe("finalize items and crimes", () => {
  it("indexes items and crime verb mappings", () => {
    const world = finalizeWorld({
      objects: [
        ...objects(),
        { type: "item", id: "t:coin", name: "Coin", value: 1 },
        { type: "deed", id: "t:deed", name: "Theft", standingDelta: -5 },
        { type: "crime", id: "t:law", verb: "theft", deed: "t:deed" },
      ],
      map,
    });
    expect(world.items["t:coin"]?.value).toBe(1);
    expect(world.crimes.theft).toBe("t:deed");
  });

  it("rejects two crimes for one verb", () => {
    expect(() =>
      finalizeWorld({
        objects: [
          ...objects(),
          { type: "crime", id: "t:law", verb: "theft", deed: "t:deed" },
          { type: "crime", id: "t:law2", verb: "theft", deed: "t:deed" },
        ],
        map,
      }),
    ).toThrow(/duplicate crime for verb "theft"/);
  });

  it("rejects a crime pointing at a missing deed", () => {
    const broken = [
      ...objects(),
      { type: "crime" as const, id: "t:law", verb: "theft" as const, deed: "t:ghost" },
    ];
    expect(() => finalizeWorld({ objects: broken, map })).toThrow(/unknown deed "t:ghost"/);
  });

  it("rejects pocket items that do not exist", () => {
    const broken = objects().map((object) =>
      object.type === "npc" ? { ...object, pockets: ["t:ghost"] } : object,
    );
    expect(() => finalizeWorld({ objects: broken, map })).toThrow(
      /npc "base:merchant": unknown item "t:ghost" in pockets/,
    );
  });

  it("rejects shop wares that do not exist", () => {
    const broken = objects().map((object) =>
      object.type === "npc" ? { ...object, shop: { sells: ["t:ghost"] } } : object,
    );
    expect(() => finalizeWorld({ objects: broken, map })).toThrow(
      /npc "base:merchant": unknown item "t:ghost" in shop/,
    );
  });

  it("rejects a confront dialogue that does not exist", () => {
    const broken = objects().map((object) =>
      object.type === "npc"
        ? { ...object, confront: { standingBelow: -10, dialogue: "base:ghost_talk" } }
        : object,
    );
    expect(() => finalizeWorld({ objects: broken, map })).toThrow(
      /npc "base:merchant": unknown dialogue "base:ghost_talk" in confront/,
    );
  });

  it("rejects a map item that no pack defines", () => {
    const brokenMap: MapModel = {
      ...map,
      items: [{ itemId: "t:ghost", pos: { x: 0, y: 0 } }],
    };
    expect(() => finalizeWorld({ objects: objects(), map: brokenMap })).toThrow(
      /map "town": unknown item "t:ghost" placed at \(0,0\)/,
    );
  });
});
```

- [x] **Step 4: Implement in `packages/content/src/finalize.ts`**

- New buckets:

```ts
const items: Record<string, ItemDef> = {};
const crimes: Partial<Record<CrimeVerb, string>> = {};
```

- Switch cases:

```ts
      case "item":
        assertNewId(items, object.id, "item");
        items[object.id] = { id: object.id, name: object.name, value: object.value };
        break;
      case "crime":
        if (crimes[object.verb] !== undefined) {
          throw new ContentError(`duplicate crime for verb "${object.verb}"`);
        }
        crimes[object.verb] = object.deed;
        break;
```

- NPC bucket entry gains the new fields (conditional spreads for the optionals, the
  dialogue-def pattern already in this file):

```ts
npcs[object.id] = {
  id: object.id,
  name: object.name,
  factionId: object.faction,
  dialogueId: object.dialogue,
  schedule: object.schedule,
  pockets: object.pockets,
  ...(object.shop !== undefined ? { shop: { sells: object.shop.sells } } : {}),
  ...(object.confront !== undefined
    ? {
        confront: {
          standingBelow: object.confront.standingBelow,
          dialogueId: object.confront.dialogue,
        },
      }
    : {}),
};
```

- Link pass additions (after the existing npc loop body):

```ts
for (const itemId of npc.pockets) {
  if (items[itemId] === undefined) {
    throw new ContentError(`npc "${npc.id}": unknown item "${itemId}" in pockets`);
  }
}
for (const itemId of npc.shop?.sells ?? []) {
  if (items[itemId] === undefined) {
    throw new ContentError(`npc "${npc.id}": unknown item "${itemId}" in shop`);
  }
}
if (npc.confront !== undefined && dialogues[npc.confront.dialogueId] === undefined) {
  throw new ContentError(
    `npc "${npc.id}": unknown dialogue "${npc.confront.dialogueId}" in confront`,
  );
}
```

plus, after the dialogue loop:

```ts
for (const [verb, deedId] of Object.entries(crimes)) {
  if (deeds[deedId] === undefined) {
    throw new ContentError(`crime "${verb}": unknown deed "${deedId}"`);
  }
}
for (const placed of options.map.items) {
  if (items[placed.itemId] === undefined) {
    throw new ContentError(
      `map "${options.map.id}": unknown item "${placed.itemId}" placed at (${placed.pos.x},${placed.pos.y})`,
    );
  }
}
```

- The dialogue effects link loop already skipped `pay` effects since Task 2 (it narrows
  with `effect.type === "deed" && deeds[effect.deedId] === undefined`); confirmed this still
  matches the plan's intent, so no change was needed there. `toDialogueDef`'s effect mapping
  did need a fix, though: it previously assumed every effect was a `deed` effect
  (`{ type: "deed" as const, deedId: effect.deed }` unconditionally), which no longer compiles
  now that `effect` can be a `pay` effect without a `.deed` property. Changed it to map each
  effect by its own `type`.

- [x] **Step 5: Verify pass, full gate, commit**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Validate and link items, crimes, shops, and confrontations"
```

## Task 13: Content — base pack 0.3.0: the watch, wares, and laws

**Files:**

- Create: `packages/content/packs/base/items.json`, `packages/content/packs/base/crimes.json`
- Modify: `packages/content/packs/base/{pack,factions,deeds,npcs,dialogues}.json`, `packages/content/src/base.ts`, `scripts/build-town-map.ts`
- Regenerate: `packages/content/packs/base/maps/port_town.map.json` (`pnpm build:maps`)
- Test: `packages/content/src/base.test.ts` (existing suite must keep passing; add assertions)

- [x] **Step 1: Add failing base-world assertions** — append to `packages/content/src/base.test.ts`:

```ts
it("ships the watch, wares, and laws", () => {
  const world = loadBaseWorld();
  expect(world.factions["base:town_watch"]).toBeDefined();
  expect(world.npcs["base:watchwoman"]?.confront).toEqual({
    standingBelow: -10,
    dialogueId: "base:watch_confront",
  });
  expect(world.crimes).toEqual({ pickpocket: "base:pickpocketing", theft: "base:theft" });
  expect(world.npcs["base:merchant"]?.shop?.sells).toContain("base:rum_bottle");
  expect(world.map.items.length).toBeGreaterThanOrEqual(3);
});
```

- [x] **Step 2: Write the content**

`packages/content/packs/base/items.json` (new):

```json
[
  { "type": "item", "id": "base:silk_bolt", "name": "Bolt of silk", "value": 24 },
  { "type": "item", "id": "base:rum_bottle", "name": "Bottle of rum", "value": 6 },
  { "type": "item", "id": "base:dried_fish", "name": "Dried fish", "value": 3 },
  { "type": "item", "id": "base:silver_ring", "name": "Silver ring", "value": 15 },
  { "type": "item", "id": "base:tobacco_pouch", "name": "Tobacco pouch", "value": 8 }
]
```

`packages/content/packs/base/crimes.json` (new):

```json
[
  {
    "type": "crime",
    "id": "base:law_pickpocket",
    "verb": "pickpocket",
    "deed": "base:pickpocketing"
  },
  { "type": "crime", "id": "base:law_theft", "verb": "theft", "deed": "base:theft" }
]
```

`deeds.json` — append:

```json
  { "type": "deed", "id": "base:pickpocketing", "name": "Caught pickpocketing", "standingDelta": -15 },
  { "type": "deed", "id": "base:theft", "name": "Theft", "standingDelta": -20 },
  { "type": "deed", "id": "base:paid_fine", "name": "Squared with the watch", "standingDelta": 25 },
  { "type": "deed", "id": "base:defied_watch", "name": "Defied the watch", "standingDelta": -5 }
```

`factions.json` — append:

```json
{ "type": "faction", "id": "base:town_watch", "name": "The Town Watch" }
```

`npcs.json` — give every NPC `pockets` and the merchant a shop:

- tavernkeeper: `"pockets": ["base:rum_bottle"]`
- merchant: `"pockets": ["base:silver_ring"]`, `"shop": { "sells": ["base:rum_bottle", "base:dried_fish", "base:silk_bolt"] }`
- harbormaster: `"pockets": ["base:tobacco_pouch"]`
- stevedore: `"pockets": ["base:dried_fish"]`

and append the watchwoman:

```json
{
  "type": "npc",
  "id": "base:watchwoman",
  "name": "Rosa",
  "faction": "base:town_watch",
  "dialogue": "base:watchwoman_talk",
  "schedule": [
    { "hour": 6, "location": "watch_post" },
    { "hour": 12, "location": "dock_watch" },
    { "hour": 20, "location": "tavern_door" }
  ],
  "pockets": [],
  "confront": { "standingBelow": -10, "dialogue": "base:watch_confront" }
}
```

`dialogues.json` — append two dialogues:

```json
  {
    "type": "dialogue",
    "id": "base:watchwoman_talk",
    "start": "greeting",
    "nodes": {
      "greeting": {
        "text": "Keep your hands where I can see them, stranger.",
        "choices": [
          {
            "text": "Any trouble on the streets?",
            "condition": { "type": "faction-standing-at-least", "value": 10 },
            "next": "trouble"
          },
          { "text": "Just admiring the port." }
        ]
      },
      "trouble": {
        "text": "Nothing the watch can't handle. Stay honest and we'll get along.",
        "choices": [{ "text": "Noted." }]
      }
    }
  },
  {
    "type": "dialogue",
    "id": "base:watch_confront",
    "start": "halt",
    "nodes": {
      "halt": {
        "text": "Rosa plants herself in your path. 'Word travels, thief. Twenty coin settles it — for now.'",
        "choices": [
          {
            "text": "Pay the fine. (20 coin)",
            "condition": { "type": "coin-at-least", "value": 20 },
            "effects": [
              { "type": "pay", "amount": 20 },
              { "type": "deed", "deed": "base:paid_fine" }
            ],
            "next": "paid"
          },
          {
            "text": "I owe the watch nothing.",
            "effects": [{ "type": "deed", "deed": "base:defied_watch" }]
          }
        ]
      },
      "paid": {
        "text": "'Smart. Don't make me come find you again.'",
        "choices": [{ "text": "Understood." }]
      }
    }
  }
```

`pack.json` — bump `"version": "0.3.0"`.

`packages/content/src/base.ts` — import and parse the two new files (same pattern):

```ts
import crimesJson from "@pirata/content/packs/base/crimes.json" with { type: "json" };
import itemsJson from "@pirata/content/packs/base/items.json" with { type: "json" };
```

and add both `parsePackObjects(...)` lines to the `objects` array.

- [x] **Step 3: Extend the map** — in `scripts/build-town-map.ts`:

Six character edits to the existing `LAYOUT`, nothing else moves: row 3 col 10 `.`→`1`
(silk at the market stall, beside the merchant); row 5 col 4 `.`→`T` (tavern doorway);
row 6 col 13 `.`→`W` (watch post in the street); row 11 col 15 `.`→`D` (dock watch);
row 13 cols 9–10 `..`→`23` (rum and fish inside the warehouse — usually unwitnessed:
the safe heist, by contrast with the watched market stall). Resulting layout:

```ts
const LAYOUT: readonly string[] = [
  "########################",
  "#................~~~~~~#",
  "#.####..####.....~~~~~~#",
  "#.#BH#..#M1#.....~~~~~~#",
  "#.#C.#..##.#......~~~~~#",
  "#.##T#...........P..~~~#",
  "#............W....~~~~~#",
  "#.####..####......~~~~~#",
  "#.#..#..#..#......~~~~~#",
  "#.#..#..##.#......~~~~~#",
  "#.##.#...........N~~~~~#",
  "#..............D.S~~~~~#",
  "#.......####.......~~~~#",
  "#.......#23#.......~~~~#",
  "#.......##.#......~~~~~#",
  "########################",
];
```

Then add:

```ts
const LOCATION_LEGEND: Readonly<Record<string, string>> = {
  B: "tavern_bar",
  H: "tavern_hearth",
  C: "tavern_corner",
  M: "market",
  N: "dock_north",
  S: "dock_south",
  T: "tavern_door",
  W: "watch_post",
  D: "dock_watch",
};

const ITEM_LEGEND: Readonly<Record<string, string>> = {
  "1": "base:silk_bolt",
  "2": "base:rum_bottle",
  "3": "base:dried_fish",
};
```

collect placed items in the walk loop:

```ts
const itemId = ITEM_LEGEND[ch];
if (itemId !== undefined) {
  placedItems.push({ name: itemId, x, y });
}
```

(with `const placedItems: { name: string; x: number; y: number }[] = [];` above), and
emit a fifth layer after `locations` (bump `nextlayerid` to 6 and keep object ids
sequential after the location objects):

```ts
    {
      id: 5,
      name: "items",
      type: "objectgroup",
      objects: placedItems.map((item, index) => ({
        id: 2 + locations.length + index,
        name: item.name,
        x: item.x * TILE,
        y: item.y * TILE,
        width: TILE,
        height: TILE,
        rotation: 0,
        visible: true,
        point: false,
      })),
      opacity: 1,
      visible: true,
      x: 0,
      y: 0,
    },
```

(`nextobjectid` becomes `2 + locations.length + placedItems.length`.)

Run: `pnpm build:maps` — regenerates `port_town.map.json`. Never hand-edit it.

- [x] **Step 4: Verify the world boots and validates**

```bash
pnpm validate:content
pnpm test
```

Expected: `pack "base" OK … links resolve, world boots`; base.test.ts assertions pass.
Fiction check the guard's story: Rosa learns of a market theft only when gossip reaches
her — the merchant heads to `tavern_corner` (3,4) at 19:00, Rosa reaches `tavern_door`
(4,5) after 20:00, Chebyshev distance 1: the tavern is where word reaches the watch.

- [x] **Step 5: Full gate and commit**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Ship base pack 0.3.0: town watch, items, crimes, shop"
```

## Task 14: Client — verbs, panels, and feedback (no rules)

**Files:**

- Modify: `packages/client/index.html`, `packages/client/src/ui.ts`, `packages/client/src/world-scene.ts`

No unit tests (client stays thin; Task 15's e2e covers it). Verify each step with
`pnpm typecheck` and eyeball `pnpm dev`.

- [ ] **Step 1: `index.html`** — under the reputation `<aside>`, add:

```html
<aside id="inventory" aria-label="Inventory">
  <h2>Purse &amp; bag</h2>
  <p id="coin" data-testid="coin"></p>
  <ul id="inventory-list"></ul>
</aside>
```

After the dialogue `<section>`, add:

```html
<section id="trade" role="dialog" aria-label="Trade" hidden>
  <h2 id="trade-name"></h2>
  <h3>Their wares</h3>
  <ol id="trade-stock"></ol>
  <h3>Your goods</h3>
  <ol id="trade-goods"></ol>
  <button type="button" id="trade-close">Done (Esc)</button>
</section>
```

Update the hint line:

```html
<span id="hint"
  >Arrows/WASD move · E talk · Space wait · C sneak · G take · P pickpocket · T trade · 1-5
  choose</span
>
```

Style: `#inventory` reuses the `#reputation` panel look — change those CSS selectors to
`#reputation, #inventory { … }` groups (`#stage` grid stays `auto 200px`; both asides sit
in the right column: wrap them in `<div id="side">` with `display: grid; gap: 8px;` and
put `#reputation`/`#inventory` inside). `#trade` copies the `#dialogue` panel rules
(group the selectors); `#trade h3 { margin: 8px 0 4px; font-size: 12px; color: #8a93a3; }`.

- [ ] **Step 2: `ui.ts`** — add render helpers:

```ts
export function renderInventory(state: GameState, world: WorldDef): void {
  element<HTMLElement>("#coin").textContent = `Coin: ${String(state.player.coin)}`;
  element<HTMLElement>("#inventory-list").replaceChildren(
    ...state.player.items.map((itemId) => {
      const row = document.createElement("li");
      row.textContent = world.items[itemId]?.name ?? itemId;
      return row;
    }),
  );
}

export function renderTrade(
  state: GameState,
  world: WorldDef,
  handlers: { onBuy: (index: number) => void; onSell: (index: number) => void },
): void {
  const panel = element<HTMLElement>("#trade");
  const npc = state.trade === null ? undefined : world.npcs[state.trade.npcId];
  if (npc === undefined || state.trade === null) {
    panel.hidden = true;
    return;
  }
  const npcId = state.trade.npcId;
  panel.hidden = false;
  element<HTMLElement>("#trade-name").textContent = `Trading with ${npc.name}`;
  element<HTMLElement>("#trade-stock").replaceChildren(
    ...(npc.shop?.sells ?? []).map((itemId, index) =>
      tradeRow(
        `Buy ${world.items[itemId]?.name ?? itemId} — ${String(
          buyPrice(state, world, npcId, itemId) ?? "?",
        )}c`,
        () => {
          handlers.onBuy(index);
        },
      ),
    ),
  );
  element<HTMLElement>("#trade-goods").replaceChildren(
    ...state.player.items.map((itemId, index) =>
      tradeRow(
        `Sell ${world.items[itemId]?.name ?? itemId} — ${String(
          sellPrice(state, world, npcId, itemId) ?? "?",
        )}c`,
        () => {
          handlers.onSell(index);
        },
      ),
    ),
  );
}

function tradeRow(label: string, onClick: () => void): HTMLElement {
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  item.append(button);
  return item;
}
```

Add `buyPrice`, `sellPrice` to the `@pirata/core` imports.

- [ ] **Step 3: `world-scene.ts`**

0. **Faction color** — add the watch to `FACTION_COLORS`:
   `"base:town_watch": 0xb1493f,`

1. **Keys** — in `setUpKeys`, after the existing `keydown-E` handler:

```ts
keyboard.on("keydown-C", () => {
  this.apply({ type: "sneak" });
});
keyboard.on("keydown-G", () => {
  this.apply({ type: "take" });
});
keyboard.on("keydown-P", () => {
  this.apply({ type: "pickpocket" });
});
keyboard.on("keydown-T", () => {
  this.apply({ type: "trade" });
});
keyboard.on("keydown-ESC", () => {
  if (this.state.trade !== null) {
    this.apply({ type: "close-trade" });
  }
});
```

and block movement polling during trade — in `update()`, extend the early return:
`if (this.state.dialogue !== null || this.state.trade !== null) { return; }`.

2. **World item sprites** — add a field `private itemSprites: GameObjects.Arc[] = [];`,
   call `this.renderWorldItems()` from `create()` (after `createNpcSprites`), and:

```ts
  private renderWorldItems(): void {
    for (const sprite of this.itemSprites) {
      sprite.destroy();
    }
    this.itemSprites = this.state.worldItems.map((item) =>
      this.add.circle(item.pos.x * TILE + TILE / 2, item.pos.y * TILE + TILE / 2, 6, 0xd9a441),
    );
  }
```

3. **Feedback** — replace the no-op cases accumulated in Tasks 6–11 with real handling
   in `renderEvent`:

```ts
      case "sneak-toggled":
        this.playerSprite.setAlpha(event.sneaking ? 0.5 : 1);
        showToast(event.sneaking ? "You move quietly." : "You straighten up.");
        break;
      case "item-taken":
        this.renderWorldItems();
        this.floatText(`+ ${this.world.items[event.itemId]?.name ?? event.itemId}`, "#9fdf7f");
        break;
      case "crime-witnessed": {
        const names = event.witnessIds
          .map((id) => this.world.npcs[id]?.name ?? id)
          .join(", ");
        showToast(`${names} saw that!`);
        break;
      }
      case "pickpocket-succeeded":
        this.floatText(`+ ${this.world.items[event.itemId]?.name ?? event.itemId}`, "#9fdf7f");
        break;
      case "pickpocket-failed":
        showToast(`${this.world.npcs[event.npcId]?.name ?? event.npcId} catches your hand!`);
        break;
      case "gossip-shared": {
        const to = this.npcSprites.get(event.toNpcId);
        if (to !== undefined) {
          this.floatTextAt(to.x, to.y - 24, "psst…", "#8a93a3");
        }
        break;
      }
      case "item-bought":
        this.floatText(`-${String(event.price)}c`, "#e07a5f");
        break;
      case "item-sold":
        this.floatText(`+${String(event.price)}c`, "#9fdf7f");
        break;
      case "coin-paid":
        this.floatText(`-${String(event.amount)}c`, "#e07a5f");
        break;
      case "trade-started":
      case "trade-ended":
        break; // reflected by renderUi()
```

with the float helpers refactored from `floatDeedText` (keep that method; extract the
shared tween):

```ts
  private floatText(text: string, color: string): void {
    this.floatTextAt(this.playerSprite.x, this.playerSprite.y - 20, text, color);
  }

  private floatTextAt(x: number, y: number, text: string, color: string): void {
    const label = this.add
      .text(x, y, text, { ...LABEL_STYLE, fontSize: "12px", color })
      .setStroke("#101418", 3)
      .setOrigin(0.5, 1);
    this.tweens.add({
      targets: label,
      y: label.y - 18,
      alpha: 0,
      duration: 900,
      onComplete: () => {
        label.destroy();
      },
    });
  }
```

(`floatDeedText` becomes a thin caller of `floatTextAt` with its gain/color logic.)

4. **Panels** — extend `renderUi()`:

```ts
renderInventory(this.state, this.world);
renderTrade(this.state, this.world, {
  onBuy: (index) => {
    this.apply({ type: "buy", index });
  },
  onSell: (index) => {
    this.apply({ type: "sell", index });
  },
});
```

and wire the close button once in `create()`:

```ts
document.querySelector("#trade-close")?.addEventListener("click", () => {
  this.apply({ type: "close-trade" });
});
```

Also restore sneak alpha on load (saved games): after creating `playerSprite` in
`create()`, `this.playerSprite.setAlpha(this.state.player.sneaking ? 0.5 : 1);`.

- [ ] **Step 4: Play it** — `pnpm dev`: walk to the market, `G` on the silk with the
      merchant watching (toast + reputation drop), `T` to trade (hostile refusal if you stole),
      `C` at night near the warehouse, pickpocket someone. Fix what feels broken _in the
      client only_ — rules changes go back to their core task with a test first.

- [ ] **Step 5: Full gate and commit**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Render crime, gossip, inventory, and trade in the client"
```

## Task 15: e2e — the crime loop in a real browser

**Files:**

- Create: `e2e/crime.spec.ts`
- Modify: `e2e/social.spec.ts`

- [ ] **Step 1: Fix the M2 spec** — in `e2e/social.spec.ts`, the deed assertion gains
      the new shape:

```ts
expect(deeds).toEqual([
  {
    deedId: "base:lent_a_hand",
    npcId: "base:harbormaster",
    tick: 4,
    knownBy: ["base:harbormaster"],
  },
]);
```

- [ ] **Step 2: Write `e2e/crime.spec.ts`**

```ts
/* eslint-disable no-underscore-dangle -- __pirata is the documented Window debug-hook name (e2e/types.d.ts) */
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__pirata !== undefined);
});

// Spawn is (17,5); the silk bolt sits at (10,3) inside the market, watched
// by the merchant at (9,3).
async function walkToStall(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    for (let i = 0; i < 7; i += 1) {
      window.__pirata?.dispatch({ type: "move", direction: "west" });
    }
    for (let i = 0; i < 2; i += 1) {
      window.__pirata?.dispatch({ type: "move", direction: "north" });
    }
  });
}

test("stealing in front of the merchant is witnessed and remembered", async ({ page }) => {
  await walkToStall(page);
  await page.evaluate(() => {
    window.__pirata?.dispatch({ type: "take" });
  });
  const state = await page.evaluate(() => window.__pirata?.getState());
  expect(state?.player.items).toContain("base:silk_bolt");
  const theft = state?.deeds.find((deed) => deed.deedId === "base:theft");
  expect(theft?.knownBy).toContain("base:merchant");
  await expect(page.getByTestId("base:merchants_guild")).toContainText("-20");
});

test("a hostile merchant refuses to trade", async ({ page }) => {
  await walkToStall(page);
  await page.evaluate(() => {
    window.__pirata?.dispatch({ type: "take" });
    window.__pirata?.dispatch({ type: "trade" });
  });
  const trade = await page.evaluate(() => window.__pirata?.getState().trade);
  expect(trade).toBeNull();
});

test("buying and selling moves coin and goods", async ({ page }) => {
  await walkToStall(page);
  await page.evaluate(() => {
    window.__pirata?.dispatch({ type: "trade" });
  });
  await expect(page.getByTestId("coin")).toContainText("20");
  await page.getByRole("button", { name: /Buy Bottle of rum/ }).click();
  await expect(page.getByTestId("coin")).toContainText("14");
  await page.getByRole("button", { name: /Sell Bottle of rum/ }).click();
  await expect(page.getByTestId("coin")).toContainText("17");
  await page.evaluate(() => {
    window.__pirata?.dispatch({ type: "close-trade" });
  });
  const state = await page.evaluate(() => window.__pirata?.getState());
  expect(state?.player.items).toEqual([]);
  expect(state?.trade).toBeNull();
});

test("sneaking doubles the cost of a step", async ({ page }) => {
  await page.evaluate(() => {
    window.__pirata?.dispatch({ type: "sneak" });
    window.__pirata?.dispatch({ type: "move", direction: "west" });
  });
  const state = await page.evaluate(() => window.__pirata?.getState());
  expect(state?.player.sneaking).toBe(true);
  expect(state?.tick).toBe(2);
});
```

(Path check for `walkToStall`: (17,5)→west 7→(10,5), row 5 is open street from col 6
to 17; north 2 → (10,4) the market door → (10,3) the stall. The merchant at (9,3) is
adjacent — both the witness and, for the trade test, the shopkeeper in reach.)

- [ ] **Step 3: Run** — `pnpm test:e2e`
      Expected: all specs pass (social + crime). If the stall route hits a wall, print the
      walls row and fix the _route_, not the map.

- [ ] **Step 4: Full gate and commit**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e
git add -A && git commit -m "Cover theft, refusal, trade, and sneak in e2e"
```

## Task 16: ADR, docs sync, and PR

**Files:**

- Create: `docs/adr/0003-crime-gossip-and-coin.md`
- Modify: `CLAUDE.md` (only if a convention changed), this plan (record deviations)

- [ ] **Step 1: Write the ADR** — `docs/adr/0003-crime-gossip-and-coin.md`, following
      0002's format (Status/Context/Decision/Consequences). Content — the decisions from the
      "Design decisions" section above, compressed:

```markdown
# 0003 — Crime, gossip, and coin

**Status:** Accepted (2026-07-07) · **Milestone:** M3

## Context

M2 shipped a deed ledger with a placeholder rule: a witness's whole faction learned of
a deed instantly. M3 closes the crime loop (spec §4.3), which requires knowledge to
travel — and be evadable. Theft needs something to steal, so items and coin arrive here.

## Decision

- **Knowledge-based standing.** `DeedRecord.knownBy` lists who knows. NPC standing sums
  deeds they know; faction standing sums deeds any member knows, once per deed.
- **Gossip is co-location.** NPC pairs within Chebyshev 2 with line of sight merge
  knowledge every tick. No rates, no RNG: schedules make rumor geography (the tavern at
  night). All deeds spread, kind words included.
- **Awareness is radius + Bresenham LOS.** Radius 5 by day, 2 at night (21:00–05:00),
  halved sneaking. Sneak is free to toggle; sneaking movement costs 2 ticks.
- **Crimes are content.** A `crime` object maps verb → deed; a verb without a crime def
  is rejected. Unwitnessed crimes land on the ledger with empty `knownBy` (no standing
  effect anywhere).
- **Confrontation is knowledge-gated.** An NPC with `confront` forces dialogue when
  adjacent and _personally_ below the threshold. Fines use the new dialogue vocabulary
  (`coin-at-least`, `pay`). Paying squares you with the guard, not with everyone who
  knows — factions forgive separately.
- **Trade bands as consequence.** Shopkeeper's faction standing picks refuse / wary /
  normal / friendly price bands (constants in core until a second shop needs data).
  Infinite stock, buys anything, no stolen-goods flag yet.

## Consequences

- SAVE_VERSION 3; M2 saves start fresh (designed path).
- Every consequence is evadable by controlling who knows — silence, distance, or speed.
- Deferred: eavesdropping and lockpicking (M4), guard escalation beyond fines, stolen
  goods tracking, per-pack tuning of perception/trade constants.
```

- [ ] **Step 2: Sync docs**

- Reread this plan top to bottom; record any execution deviations in an
  `## Execution deviations` section at the end (M2's plan shows the format).
- `CLAUDE.md`: no changes expected — commands and layer rules are unchanged. Touch it
  only if a convention actually changed during execution.

- [ ] **Step 3: Full gate, push, PR**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm validate:content && pnpm check:attribution
git add -A && git commit -m "Add ADR-0003 and record the M3 plan"
git push -u origin feat/m3-lawless-world
gh pr create --title "M3: a lawless world — crime, gossip, items, and coin" --body "$(cat <<'EOF'
Closes the M3 milestone (spec §7): the crime loop.

- Knowledge-based reputation: deeds carry a `knownBy` witness set; NPC/faction standing
  is computed from what each party knows (replaces M2's instant-faction rule, ADR-0003)
- Gossip: NPCs in conversation range merge deed knowledge each tick — word reaches the
  watch through the tavern, and leaving town before witnesses talk actually works
- Awareness: perception radius (day/night) + Bresenham line of sight; sneak toggle
  halves the radius and doubles movement time cost
- Verbs: take (theft) and pickpocket (first gameplay RNG use), both witnessed through
  the awareness model; crimes are content-defined verb→deed mappings
- Consequences: the town watch confronts a player the guard knows to be a criminal
  (pay a fine via new `pay` effect / `coin-at-least` condition, or defy her); trade
  prices move through standing bands, hostile merchants refuse outright
- Items + coin: item defs, NPC pockets, map-placed items, player purse and bag; minimal
  buy/sell shop at the merchant
- Base pack 0.3.0: town watch faction, Rosa the watchwoman, 5 items, 2 crime laws,
  fine dialogue, market stall and warehouse goods; SAVE_VERSION 3

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist (run after writing, before execution)

- **Spec coverage (M3, spec §7):** stealth/awareness → Tasks 5–6; verb set with
  witnesses → Tasks 7–8; gossip propagation → Task 9; consequences: dialogue (existing
  conditions now knowledge-fed, Task 4), guards → Task 10, prices → Task 11. Items+coin
  → Tasks 1–3, 12–13. Playable + deployed → Tasks 14–16.
- **Descoped knowingly:** eavesdropping, lockpicking (owner decision, recorded above);
  guard escalation; stolen-goods flags; light sources beyond the day/night split.
- **Type consistency spot-checks:** `witnesses(state, world, at)` (Tasks 5, 7, 8);
  `DeedRecord.knownBy` sorted everywhere it is built (Tasks 3, 7, 8, 9, 10);
  `applyTick(state, playerPos, events, world, ticks)` (Tasks 6, 9, 10); trade price
  functions take `(state, world, npcId, itemId)` (Tasks 11, 14).
