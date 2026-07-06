# Pirata M2: A Social World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the port town with NPCs that follow daily schedules, talk through data-driven dialogue trees, and remember what the player does via a per-NPC/per-faction deed ledger that visibly changes how they respond.

**Architecture:** All rules land in `@pirata/core` as new pure modules (time, pathfinding, NPC schedules, dialogue, reputation) driven through the existing `advance()` entry point, which now takes a `WorldDef` (map + finalized content) instead of a bare map. `@pirata/content` grows Zod schemas for factions, deeds, NPCs, and dialogues, plus a link pass (`finalizeWorld`) that resolves every cross-reference and fails loudly. `@pirata/client` renders NPCs as Phaser sprites and the social UI (dialogue, reputation, clock) as accessible DOM overlays; it still contains zero game rules. Spec: `docs/superpowers/specs/2026-07-05-pirata-design.md` (§4.3 factions/reputation, NPCs; roadmap M2).

**Tech Stack:** Existing toolchain unchanged — TypeScript strict/ESM, pnpm workspaces, Phaser 4, Vite, Zod 4, vitest + fast-check, Playwright, oxlint + oxfmt.

---

## Execution ground rules

- Work on branch `feat/m2-social-world` in the session worktree. Never commit to `main`.
- Pushing this repo does **not** require the YubiKey (project owner's standing exception, recorded 2026-07-05): push the feature branch and open a draft PR at the end. Never push `main`.
- Every task ends green: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` before every commit. Run `pnpm format` first if oxfmt complains (it formats markdown too).
- Dependency versions never come from memory. This plan adds **no** new dependencies.
- Commits: imperative, ≤72-char subject, one logical change, trailer `Co-Authored-By: Claude <noreply@anthropic.com>`.
- TDD throughout: write the failing test, run it, watch it fail for the right reason, implement, watch it pass.
- The `window.__pirata` debug hook (getState/dispatch) must keep working — the e2e suite drives it.

## Design decisions (why the code below looks the way it does)

- **Time:** 1 tick = 6 in-game minutes; `TICKS_PER_HOUR = 10`, day = 240 ticks; the clock starts at 08:00 on day 1. Ticks only advance on `move` and `wait` intents (roguelike time). Dialogue (`talk`/`choose`) is instantaneous — no ticks, so conversation partners never walk away mid-sentence.
- **Reputation is a ledger, not a number** (spec §4.3): `GameState.deeds` records `{deedId, npcId, tick}`. Standings are _computed_: an NPC's personal standing sums deeds they witnessed; a faction's standing sums deeds witnessed by any of its members. **M2 simplification:** a witness's faction learns instantly. M3 replaces this with gossip propagation over in-game time (that is when a `knownBy` set appears — don't build it now).
- **NPC movement:** each tick, an NPC takes one BFS step toward its current schedule target. BFS ignores entities; if the next step is occupied (player or NPC), the NPC waits a tick. Deterministic: fixed neighbor order, NPCs processed in `state.npcs` array order (sorted by id at creation).
- **Dialogue safety:** the link pass requires every node to have at least one _unconditioned_ choice, so conditions can never strand the player in a node with no visible options. A choice without `next` ends the dialogue.
- **Save compatibility:** `GameState` gains fields, so `SAVE_VERSION` bumps to 2. Old saves are rejected by `deserialize` and the client already falls back to a fresh game (this is the designed path, not a regression). The RNG golden-sequence test must NOT change.
- **Ids:** content object ids are namespaced snake_case (`base:tavernkeeper`). Core keeps plain `string` ids in M2 — typed id wrappers arrive when cross-type mixups become a real risk (YAGNI).

## File structure

```
pirata/
├── docs/adr/0002-social-simulation-data-model.md   # new ADR
├── scripts/build-town-map.ts                       # MODIFY: doors, location markers
├── e2e/
│   └── social.spec.ts                              # new Playwright spec
└── packages/
    ├── core/src/
    │   ├── time.ts            # new: tick → clock/hour
    │   ├── time.test.ts
    │   ├── defs.ts            # new: FactionDef/NpcDef/DialogueDef/DeedDef/WorldDef
    │   ├── map.ts             # MODIFY: named `locations` object layer
    │   ├── map.test.ts        # MODIFY
    │   ├── path.ts            # new: BFS nextStep
    │   ├── path.test.ts
    │   ├── npc.ts             # new: scheduleTarget, advanceNpcs
    │   ├── npc.test.ts
    │   ├── state.ts           # MODIFY: npcs/dialogue/deeds; createGameState(world)
    │   ├── state.test.ts      # new
    │   ├── save.ts            # MODIFY: SAVE_VERSION = 2
    │   ├── save.test.ts       # MODIFY
    │   ├── reputation.ts      # new: npcStanding, factionStanding
    │   ├── reputation.test.ts
    │   ├── dialogue.ts        # new: currentNode, visibleChoices
    │   ├── dialogue.test.ts
    │   ├── intent.ts          # MODIFY: wait/talk/choose
    │   ├── event.ts           # MODIFY: npc/dialogue/deed/reputation events
    │   ├── advance.ts         # MODIFY: switch on intent type, NPC ticking
    │   ├── advance.test.ts    # MODIFY (rewrite)
    │   ├── harness.ts         # new: runScenario (spec §5 scenario harness)
    │   ├── harness.test.ts
    │   ├── world.fixture.ts   # new: mapFromAscii + fixtureWorld (test-only, not exported)
    │   └── index.ts           # MODIFY: export the new API
    ├── content/
    │   ├── src/
    │   │   ├── schemas.ts     # MODIFY: faction/deed/npc/dialogue schemas
    │   │   ├── loader.ts      # MODIFY: parsePackObjects
    │   │   ├── loader.test.ts # MODIFY
    │   │   ├── finalize.ts    # new: link pass → WorldDef
    │   │   ├── finalize.test.ts
    │   │   ├── base.ts        # new: loadBaseWorld()
    │   │   ├── base.test.ts   # validates the shipped base pack in unit tests
    │   │   ├── validate.ts    # MODIFY: objects + link pass + spawn smoke
    │   │   └── index.ts       # MODIFY
    │   └── packs/base/
    │       ├── pack.json      # MODIFY: version 0.2.0
    │       ├── factions.json  # new
    │       ├── deeds.json     # new
    │       ├── npcs.json      # new
    │       ├── dialogues.json # new
    │       └── maps/port_town.map.json   # regenerated (never hand-edit)
    └── client/
        ├── index.html         # MODIFY: HUD, dialogue, reputation, toast DOM
        └── src/
            ├── ui.ts          # new: DOM rendering helpers
            └── world-scene.ts # MODIFY: NPCs, new intents, UI wiring
```

Boundaries unchanged: `core` imports nothing and has no DOM; `content` imports `core` types; `client` imports both. Core's new content-shaped types live in `defs.ts` so the dependency arrow keeps pointing down (content _produces_ a `WorldDef`, core _consumes_ it).

---

## Task 1: Core — game clock (`time.ts`)

**Files:**

- Create: `packages/core/src/time.ts`
- Test: `packages/core/src/time.test.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Write the failing test** — `packages/core/src/time.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { clockOf, hourOf, TICKS_PER_DAY, TICKS_PER_HOUR } from "./time.ts";

describe("game clock", () => {
  it("starts day 1 at 08:00", () => {
    expect(clockOf(0)).toEqual({ day: 1, hour: 8, minute: 0 });
  });

  it("advances 6 minutes per tick", () => {
    expect(clockOf(1)).toEqual({ day: 1, hour: 8, minute: 6 });
    expect(clockOf(7)).toEqual({ day: 1, hour: 8, minute: 42 });
  });

  it("rolls hours and days (golden values)", () => {
    expect(clockOf(10)).toEqual({ day: 1, hour: 9, minute: 0 });
    expect(clockOf(159)).toEqual({ day: 1, hour: 23, minute: 54 });
    expect(clockOf(160)).toEqual({ day: 2, hour: 0, minute: 0 });
    expect(clockOf(240)).toEqual({ day: 2, hour: 8, minute: 0 });
  });

  it("exposes hourOf as a shorthand", () => {
    expect(hourOf(110)).toBe(19);
  });

  it("keeps the day length consistent", () => {
    expect(TICKS_PER_DAY).toBe(TICKS_PER_HOUR * 24);
  });
});
```

(Golden values pin the constants: range-style assertions alone would stay green if
`TICKS_PER_HOUR` drifted, silently breaking every schedule in every content pack.)

- [x] **Step 2: Run to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./time.ts`.

- [x] **Step 3: Write `packages/core/src/time.ts`**

```ts
export const TICKS_PER_HOUR = 10;
export const HOURS_PER_DAY = 24;
export const TICKS_PER_DAY = TICKS_PER_HOUR * HOURS_PER_DAY;
export const START_HOUR = 8;

export interface Clock {
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

export function clockOf(tick: number): Clock {
  const absolute = tick + START_HOUR * TICKS_PER_HOUR;
  return {
    day: Math.floor(absolute / TICKS_PER_DAY) + 1,
    hour: Math.floor((absolute % TICKS_PER_DAY) / TICKS_PER_HOUR),
    minute: (absolute % TICKS_PER_HOUR) * (60 / TICKS_PER_HOUR),
  };
}

export function hourOf(tick: number): number {
  return clockOf(tick).hour;
}
```

- [x] **Step 4: Run to verify it passes** (`pnpm test` — PASS)

- [x] **Step 5: Export from `packages/core/src/index.ts`** (append)

```ts
export {
  clockOf,
  hourOf,
  HOURS_PER_DAY,
  START_HOUR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  type Clock,
} from "./time.ts";
```

- [x] **Step 6: Full gate and commit**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Add game clock: 10 ticks per hour, day starts 08:00"
```

## Task 2: Core — world definition types (`defs.ts`)

Types only — the contract every later task builds against. No runtime code, so no unit test; the compiler is the test.

**Files:**

- Create: `packages/core/src/defs.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Write `packages/core/src/defs.ts`**

```ts
import type { MapModel } from "./map.ts";

export interface FactionDef {
  readonly id: string;
  readonly name: string;
}

export interface ScheduleEntry {
  readonly hour: number;
  readonly location: string;
}

export interface NpcDef {
  readonly id: string;
  readonly name: string;
  readonly factionId: string;
  readonly dialogueId: string;
  readonly schedule: readonly ScheduleEntry[];
}

export type DialogueCondition =
  | { readonly type: "npc-standing-at-least"; readonly value: number }
  | { readonly type: "npc-standing-below"; readonly value: number }
  | { readonly type: "faction-standing-at-least"; readonly value: number }
  | { readonly type: "faction-standing-below"; readonly value: number };

export interface DialogueEffect {
  readonly type: "deed";
  readonly deedId: string;
}

export interface DialogueChoice {
  readonly text: string;
  readonly next?: string;
  readonly condition?: DialogueCondition;
  readonly effects?: readonly DialogueEffect[];
}

export interface DialogueNode {
  readonly text: string;
  readonly choices: readonly DialogueChoice[];
}

export interface DialogueDef {
  readonly id: string;
  readonly start: string;
  readonly nodes: Readonly<Record<string, DialogueNode>>;
}

export interface DeedDef {
  readonly id: string;
  readonly name: string;
  readonly standingDelta: number;
}

export interface WorldDef {
  readonly map: MapModel;
  readonly factions: Readonly<Record<string, FactionDef>>;
  readonly npcs: Readonly<Record<string, NpcDef>>;
  readonly dialogues: Readonly<Record<string, DialogueDef>>;
  readonly deeds: Readonly<Record<string, DeedDef>>;
}
```

Conditions are always evaluated _relative to the NPC being talked to_ (their personal standing, their faction's standing) — that keeps the M2 vocabulary tiny; explicit faction targets can be added later if content demands them.

- [x] **Step 2: Export from `packages/core/src/index.ts`** (append)

```ts
export type {
  DeedDef,
  DialogueChoice,
  DialogueCondition,
  DialogueDef,
  DialogueEffect,
  DialogueNode,
  FactionDef,
  NpcDef,
  ScheduleEntry,
  WorldDef,
} from "./defs.ts";
```

- [x] **Step 3: Full gate and commit**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Add world definition types for factions, NPCs, dialogue, deeds"
```

## Task 3: Core — named locations in the map model

**Files:**

- Modify: `packages/core/src/map.ts`
- Test: `packages/core/src/map.test.ts`

- [x] **Step 1: Add failing tests** — append to `packages/core/src/map.test.ts` (and add a `locations` layer to the existing `tiledFixture()` so it exercises the new path)

In `tiledFixture()`, add one more layer to the `layers` array:

```ts
      {
        name: "locations",
        type: "objectgroup",
        objects: [{ name: "market", x: 32, y: 32 }],
      },
```

Append tests:

```ts
describe("parseTiledMap locations", () => {
  it("reads named locations in tile coordinates", () => {
    const map = parseTiledMap("test", tiledFixture());
    expect(map.locations).toEqual({ market: { x: 1, y: 1 } });
  });

  it("defaults to no locations when the layer is absent", () => {
    const fixture = tiledFixture();
    fixture["layers"] = (fixture["layers"] as { name: string }[]).filter(
      (layer) => layer.name !== "locations",
    );
    expect(parseTiledMap("test", fixture).locations).toEqual({});
  });

  it("rejects duplicate location names", () => {
    const fixture = tiledFixture();
    const layers = fixture["layers"] as { name: string; objects?: object[] }[];
    const locations = layers.find((layer) => layer.name === "locations");
    locations?.objects?.push({ name: "market", x: 64, y: 32 });
    expect(() => parseTiledMap("dupe", fixture)).toThrow(/duplicate location "market"/);
  });

  it("rejects a location on a blocked tile", () => {
    const fixture = tiledFixture();
    const layers = fixture["layers"] as {
      name: string;
      objects?: { name: string; x: number; y: number }[];
    }[];
    const locations = layers.find((layer) => layer.name === "locations");
    locations?.objects?.push({ name: "bad", x: 0, y: 0 });
    expect(() => parseTiledMap("blocked", fixture)).toThrow(/"bad".*not on walkable ground/);
  });
});
```

Note the existing fixture: 3×2 map, walls layer `[2, 0, 0, 0, 0, 2]`, so tile (0,0) is
blocked and (1,1) is open.

- [x] **Step 2: Run to verify failure** (`pnpm test` — FAIL: `map.locations` is undefined)

- [x] **Step 3: Implement in `packages/core/src/map.ts`**

Add `locations` to the interface:

```ts
export interface MapModel {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly blocked: readonly boolean[];
  readonly playerSpawn: Vec2;
  readonly locations: Readonly<Record<string, Vec2>>;
}
```

In `parseTiledMap`, after the `playerSpawn` bounds check and before the `return`, add:

```ts
const blocked = walls.data.map((gid) => gid !== 0);

const locations: Record<string, Vec2> = {};
const locationLayer = layers.find(
  (layer) => layer.type === "objectgroup" && layer.name === "locations",
);
for (const object of locationLayer?.objects ?? []) {
  const pos = {
    x: Math.floor(object.x / map.tilewidth),
    y: Math.floor(object.y / map.tileheight),
  };
  if (locations[object.name] !== undefined) {
    throw new MapParseError(`map "${id}": duplicate location "${object.name}"`);
  }
  const outOfBounds = pos.x < 0 || pos.y < 0 || pos.x >= map.width || pos.y >= map.height;
  if (outOfBounds || (blocked[pos.y * map.width + pos.x] ?? true)) {
    throw new MapParseError(
      `map "${id}": location "${object.name}" at (${pos.x},${pos.y}) is not on walkable ground`,
    );
  }
  locations[object.name] = pos;
}
```

and change the `return` to use the hoisted `blocked` and include `locations`:

```ts
return {
  id,
  width: map.width,
  height: map.height,
  blocked,
  playerSpawn,
  locations,
};
```

- [x] **Step 4: Verify pass, full gate, commit**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Parse named walkable locations from Tiled object layers"
```

## Task 4: Core — BFS pathfinding (`path.ts`)

**Files:**

- Create: `packages/core/src/path.ts`, `packages/core/src/world.fixture.ts`
- Test: `packages/core/src/path.test.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Create the shared test fixture** — `packages/core/src/world.fixture.ts` (test-only helper: imported by `*.test.ts` files, never exported from `index.ts`; vitest only collects `*.test.ts`, so this file adds no empty test suite)

```ts
import type { MapModel } from "./map.ts";
import type { Vec2 } from "./state.ts";

/**
 * Builds a MapModel from ASCII art for tests.
 * Legend: '#' wall, '.' floor, 'P' player spawn, any lowercase letter a
 * walkable named location (the letter is the location name).
 */
export function mapFromAscii(rows: readonly string[]): MapModel {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const blocked: boolean[] = [];
  const locations: Record<string, Vec2> = {};
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
    });
  });
  return { id: "fixture", width, height, blocked, playerSpawn: spawn, locations };
}
```

- [x] **Step 2: Write the failing tests** — `packages/core/src/path.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { nextStep } from "./path.ts";
import { mapFromAscii } from "./world.fixture.ts";

const open = mapFromAscii(["#####", "#...#", "#.#.#", "#...#", "#####"]);

describe("nextStep", () => {
  it("steps directly toward an adjacent target", () => {
    expect(nextStep(open, { x: 1, y: 1 }, { x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
  });

  it("routes around walls (golden first step)", () => {
    // Both routes around the center wall are 4 steps; the fixed neighbor
    // order (N,E,S,W) must deterministically pick east.
    expect(nextStep(open, { x: 1, y: 1 }, { x: 3, y: 3 })).toEqual({ x: 2, y: 1 });
  });

  it("returns undefined when already at the target", () => {
    expect(nextStep(open, { x: 1, y: 1 }, { x: 1, y: 1 })).toBeUndefined();
  });

  it("returns undefined for a blocked target", () => {
    expect(nextStep(open, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeUndefined();
  });

  it("returns undefined when the target is unreachable", () => {
    const sealed = mapFromAscii(["#####", "#.#.#", "#####"]);
    expect(nextStep(sealed, { x: 1, y: 1 }, { x: 3, y: 1 })).toBeUndefined();
  });

  it("is deterministic", () => {
    const a = nextStep(open, { x: 1, y: 1 }, { x: 3, y: 3 });
    const b = nextStep(open, { x: 1, y: 1 }, { x: 3, y: 3 });
    expect(a).toEqual(b);
  });
});
```

- [x] **Step 3: Run to verify failure** (`pnpm test` — FAIL: cannot resolve `./path.ts`)

- [x] **Step 4: Write `packages/core/src/path.ts`**

```ts
import { isBlocked, type MapModel } from "./map.ts";
import type { Vec2 } from "./state.ts";

const STEP_ORDER: readonly Vec2[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/**
 * First step of a shortest path from `from` to `to`, or undefined when
 * already there or unreachable. Deterministic: BFS with a fixed neighbor
 * order. Ignores entities on purpose — callers decide what "occupied" means.
 */
export function nextStep(map: MapModel, from: Vec2, to: Vec2): Vec2 | undefined {
  if (from.x === to.x && from.y === to.y) {
    return undefined;
  }
  if (isBlocked(map, to.x, to.y) || isBlocked(map, from.x, from.y)) {
    return undefined;
  }

  const distances = new Array<number>(map.width * map.height).fill(-1);
  distances[to.y * map.width + to.x] = 0;
  const queue: Vec2[] = [to];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    if (current === undefined) {
      break;
    }
    const currentDistance = distances[current.y * map.width + current.x] ?? 0;
    for (const step of STEP_ORDER) {
      const next = { x: current.x + step.x, y: current.y + step.y };
      if (isBlocked(map, next.x, next.y)) {
        continue;
      }
      const index = next.y * map.width + next.x;
      if (distances[index] !== -1) {
        continue;
      }
      distances[index] = currentDistance + 1;
      queue.push(next);
    }
  }

  const fromDistance = distances[from.y * map.width + from.x] ?? -1;
  if (fromDistance === -1) {
    return undefined;
  }
  for (const step of STEP_ORDER) {
    const next = { x: from.x + step.x, y: from.y + step.y };
    if (isBlocked(map, next.x, next.y)) {
      continue;
    }
    if (distances[next.y * map.width + next.x] === fromDistance - 1) {
      return next;
    }
  }
  return undefined;
}
```

- [x] **Step 5: Verify pass, export, full gate, commit**

Append to `packages/core/src/index.ts`:

```ts
export { nextStep } from "./path.ts";
```

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Add deterministic BFS pathfinding for NPC movement"
```

## Task 5: Core — schedule targeting (`npc.ts`, part 1)

**Files:**

- Create: `packages/core/src/npc.ts`
- Test: `packages/core/src/npc.test.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Write the failing tests** — `packages/core/src/npc.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { NpcDef } from "./defs.ts";
import { scheduleTarget } from "./npc.ts";

function npcWithSchedule(schedule: NpcDef["schedule"]): NpcDef {
  return {
    id: "test:npc",
    name: "Npc",
    factionId: "test:guild",
    dialogueId: "test:talk",
    schedule,
  };
}

describe("scheduleTarget", () => {
  const npc = npcWithSchedule([
    { hour: 6, location: "dock" },
    { hour: 20, location: "tavern" },
  ]);

  it("picks the latest entry at or before the hour", () => {
    expect(scheduleTarget(npc, 6)).toBe("dock");
    expect(scheduleTarget(npc, 12)).toBe("dock");
    expect(scheduleTarget(npc, 20)).toBe("tavern");
    expect(scheduleTarget(npc, 23)).toBe("tavern");
  });

  it("wraps to yesterday's last entry before the first hour", () => {
    expect(scheduleTarget(npc, 5)).toBe("tavern");
  });

  it("handles a single-entry schedule", () => {
    expect(scheduleTarget(npcWithSchedule([{ hour: 0, location: "bar" }]), 13)).toBe("bar");
  });

  it("returns undefined for an empty schedule", () => {
    expect(scheduleTarget(npcWithSchedule([]), 10)).toBeUndefined();
  });
});
```

- [x] **Step 2: Run to verify failure** (`pnpm test` — FAIL: cannot resolve `./npc.ts`)

- [x] **Step 3: Write `packages/core/src/npc.ts`** (just `scheduleTarget`; `advanceNpcs` arrives in Task 9)

```ts
import type { NpcDef } from "./defs.ts";

/**
 * Where an NPC wants to be at the given hour: the latest schedule entry at
 * or before it. Before the day's first entry, yesterday's last entry still
 * holds (schedules wrap around midnight). Undefined only for an empty
 * schedule, which the content link pass forbids.
 */
export function scheduleTarget(npc: NpcDef, hour: number): string | undefined {
  const last = npc.schedule[npc.schedule.length - 1];
  if (last === undefined) {
    return undefined;
  }
  let target = last.location;
  for (const entry of npc.schedule) {
    if (entry.hour <= hour) {
      target = entry.location;
    }
  }
  return target;
}
```

- [x] **Step 4: Verify pass, export, full gate, commit**

Append to `packages/core/src/index.ts`:

```ts
export { scheduleTarget } from "./npc.ts";
```

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Resolve NPC schedule targets by hour with midnight wrap"
```

## Task 6: Core — GameState v2, `createGameState(world)`, SAVE_VERSION 2

**Files:**

- Modify: `packages/core/src/state.ts`, `packages/core/src/save.ts`, `packages/core/src/world.fixture.ts`, `packages/core/src/index.ts`
- Test: `packages/core/src/state.test.ts` (new), `packages/core/src/save.test.ts`

- [ ] **Step 1: Extend the fixture** — append to `packages/core/src/world.fixture.ts`

The fixture town used by every core test from here on. `t` is a dead-end nook (the keeper never blocks a corridor); `a`→`b` is the walker's commute.

```ts
export const FIXTURE_MAP = mapFromAscii([
  "########",
  "#P....a#",
  "#.####.#",
  "#b.....#",
  "####t###",
  "########",
]);

export function fixtureWorld(): WorldDef {
  return {
    map: FIXTURE_MAP,
    factions: {
      "test:guild": { id: "test:guild", name: "The Guild" },
      "test:dockers": { id: "test:dockers", name: "The Dockers" },
    },
    deeds: {
      "test:praise": { id: "test:praise", name: "Praise", standingDelta: 10 },
      "test:slight": { id: "test:slight", name: "Slight", standingDelta: -10 },
    },
    npcs: {
      "test:keeper": {
        id: "test:keeper",
        name: "Keeper",
        factionId: "test:guild",
        dialogueId: "test:keeper_talk",
        schedule: [{ hour: 0, location: "t" }],
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
    },
  };
}
```

Add the import at the top of `world.fixture.ts`:

```ts
import type { WorldDef } from "./defs.ts";
```

Geometry facts the tests rely on: player spawns at (1,1); keeper's post `t` is (4,4),
reachable only through (4,3); walker starts at `a` (6,1) and commutes to `b` (1,3) at
hour 9 — a 7-step route down the east corridor and along the south street.

- [ ] **Step 2: Write the failing tests** — `packages/core/src/state.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { createGameState } from "./state.ts";
import { fixtureWorld } from "./world.fixture.ts";

describe("createGameState", () => {
  it("spawns the player at the map spawn with an empty ledger", () => {
    const state = createGameState({ seed: 7, world: fixtureWorld() });
    expect(state.tick).toBe(0);
    expect(state.player.pos).toEqual({ x: 1, y: 1 });
    expect(state.dialogue).toBeNull();
    expect(state.deeds).toEqual([]);
  });

  it("places NPCs at their scheduled posts for the starting hour, sorted by id", () => {
    const state = createGameState({ seed: 7, world: fixtureWorld() });
    expect(state.npcs).toEqual([
      { id: "test:keeper", pos: { x: 4, y: 4 } },
      { id: "test:walker", pos: { x: 6, y: 1 } },
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

And update `packages/core/src/save.test.ts` (full replacement — the old test built states with the removed `createGameState` signature):

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
      deeds: [{ deedId: "test:praise", npcId: "test:keeper", tick: 3 }],
    };
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it("rejects malformed JSON", () => {
    expect(() => deserialize("not json{")).toThrow(SaveError);
  });

  it("rejects the M1 save version", () => {
    expect(() => deserialize(JSON.stringify({ version: 1, state: {} }))).toThrow(/version 1/);
  });

  it("rejects a payload without state", () => {
    expect(() => deserialize(JSON.stringify({ version: 2 }))).toThrow(SaveError);
  });
});
```

- [ ] **Step 3: Run to verify failure** (`pnpm test` — FAIL: `createGameState` signature, missing state fields, save version)

- [ ] **Step 4: Rewrite `packages/core/src/state.ts`**

```ts
import type { WorldDef } from "./defs.ts";
import { scheduleTarget } from "./npc.ts";
import { seedRng, type RngState } from "./rng.ts";
import { hourOf } from "./time.ts";

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface PlayerState {
  readonly pos: Vec2;
}

export interface NpcState {
  readonly id: string;
  readonly pos: Vec2;
}

export interface DialogueState {
  readonly npcId: string;
  readonly nodeId: string;
}

export interface DeedRecord {
  readonly deedId: string;
  readonly npcId: string;
  readonly tick: number;
}

export interface GameState {
  readonly tick: number;
  readonly rng: RngState;
  readonly mapId: string;
  readonly player: PlayerState;
  readonly npcs: readonly NpcState[];
  readonly dialogue: DialogueState | null;
  readonly deeds: readonly DeedRecord[];
}

export function createGameState(options: { seed: number; world: WorldDef }): GameState {
  const { world } = options;
  const hour = hourOf(0);
  const npcs: NpcState[] = [];
  const occupied = new Map<string, string>();
  occupied.set(`${world.map.playerSpawn.x},${world.map.playerSpawn.y}`, "the player");
  for (const npcId of Object.keys(world.npcs).sort()) {
    const def = world.npcs[npcId];
    if (def === undefined) {
      continue;
    }
    const location = scheduleTarget(def, hour);
    const pos = location === undefined ? undefined : world.map.locations[location];
    if (pos === undefined) {
      throw new Error(
        `npc "${npcId}": schedule location "${location ?? "(none)"}" is missing from map "${world.map.id}"`,
      );
    }
    const key = `${pos.x},${pos.y}`;
    const holder = occupied.get(key);
    if (holder !== undefined) {
      throw new Error(`npc "${npcId}" spawns on the same tile (${pos.x},${pos.y}) as ${holder}`);
    }
    occupied.set(key, `npc "${npcId}"`);
    npcs.push({ id: npcId, pos });
  }
  return {
    tick: 0,
    rng: seedRng(options.seed),
    mapId: world.map.id,
    player: { pos: world.map.playerSpawn },
    npcs,
    dialogue: null,
    deeds: [],
  };
}
```

- [ ] **Step 5: Bump `packages/core/src/save.ts`**

Change one line:

```ts
export const SAVE_VERSION = 2;
```

- [ ] **Step 6: Update exports and fix call-site fallout**

`packages/core/src/index.ts` — replace the state export line with:

```ts
export {
  createGameState,
  type DeedRecord,
  type DialogueState,
  type GameState,
  type NpcState,
  type PlayerState,
  type Vec2,
} from "./state.ts";
```

`packages/core/src/advance.test.ts` still calls the old `createGameState({seed, mapId, playerSpawn})` — it is fully rewritten in Task 10; for now make it compile by replacing its `freshState()` helper body with:

```ts
function freshState() {
  return {
    tick: 0,
    rng: 42,
    mapId: map.id,
    player: { pos: map.playerSpawn },
    npcs: [],
    dialogue: null,
    deeds: [],
  } satisfies GameState;
}
```

(add `import type { GameState } from "./state.ts";` and drop the `createGameState` import). The client (`world-scene.ts`) also breaks here; it is rewritten in Task 15 — until then `pnpm typecheck` fails only in `@pirata/client`, which is acceptable _mid-task_ but not at commit time, so apply this **temporary** client patch now in `packages/client/src/world-scene.ts`:

1. Add `WorldDef` to the `@pirata/core` type imports and a field below `map`:

```ts
  private tempWorld!: WorldDef;
```

2. In `create()`, right after `this.map = parseTiledMap(...)`, add:

```ts
// Temporary M2 scaffolding: an empty world until Task 15 loads the base pack.
this.tempWorld = { map: this.map, factions: {}, npcs: {}, dialogues: {}, deeds: {} };
```

3. In `loadOrCreateState()`, replace the `createGameState(...)` call with:

```ts
return createGameState({ seed: Date.now() >>> 0, world: this.tempWorld });
```

(Task 15 replaces this whole file with the real world-loading version.)

- [ ] **Step 7: Verify pass, full gate, commit**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Extend GameState with NPCs, dialogue, and deed ledger (save v2)"
```

## Task 7: Core — reputation from the deed ledger

**Files:**

- Create: `packages/core/src/reputation.ts`
- Test: `packages/core/src/reputation.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing tests** — `packages/core/src/reputation.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { factionStanding, npcStanding } from "./reputation.ts";
import { createGameState, type GameState } from "./state.ts";
import { fixtureWorld } from "./world.fixture.ts";

const world = fixtureWorld();

function stateWithDeeds(deeds: GameState["deeds"]): GameState {
  return { ...createGameState({ seed: 1, world }), deeds };
}

describe("standing", () => {
  it("is zero with an empty ledger", () => {
    const state = stateWithDeeds([]);
    expect(npcStanding(state, world, "test:keeper")).toBe(0);
    expect(factionStanding(state, world, "test:guild")).toBe(0);
  });

  it("sums deltas of deeds the NPC witnessed", () => {
    const state = stateWithDeeds([
      { deedId: "test:praise", npcId: "test:keeper", tick: 1 },
      { deedId: "test:praise", npcId: "test:keeper", tick: 2 },
      { deedId: "test:slight", npcId: "test:keeper", tick: 3 },
    ]);
    expect(npcStanding(state, world, "test:keeper")).toBe(10);
  });

  it("keeps ledgers per NPC", () => {
    const state = stateWithDeeds([{ deedId: "test:slight", npcId: "test:walker", tick: 1 }]);
    expect(npcStanding(state, world, "test:keeper")).toBe(0);
    expect(npcStanding(state, world, "test:walker")).toBe(-10);
  });

  it("aggregates faction standing across member witnesses only", () => {
    const state = stateWithDeeds([
      { deedId: "test:praise", npcId: "test:keeper", tick: 1 },
      { deedId: "test:slight", npcId: "test:walker", tick: 2 },
    ]);
    expect(factionStanding(state, world, "test:guild")).toBe(10);
    expect(factionStanding(state, world, "test:dockers")).toBe(-10);
  });

  it("ignores deeds whose definition is unknown", () => {
    const state = stateWithDeeds([{ deedId: "test:ghost", npcId: "test:keeper", tick: 1 }]);
    expect(npcStanding(state, world, "test:keeper")).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure** (`pnpm test` — FAIL: cannot resolve `./reputation.ts`)

- [ ] **Step 3: Write `packages/core/src/reputation.ts`**

```ts
import type { WorldDef } from "./defs.ts";
import type { GameState } from "./state.ts";

export function npcStanding(state: GameState, world: WorldDef, npcId: string): number {
  let standing = 0;
  for (const deed of state.deeds) {
    if (deed.npcId !== npcId) {
      continue;
    }
    standing += world.deeds[deed.deedId]?.standingDelta ?? 0;
  }
  return standing;
}

/**
 * M2 rule: a witnessed deed is known to the witness's whole faction
 * immediately. M3 replaces this with gossip propagation over in-game time.
 */
export function factionStanding(state: GameState, world: WorldDef, factionId: string): number {
  let standing = 0;
  for (const deed of state.deeds) {
    if (world.npcs[deed.npcId]?.factionId !== factionId) {
      continue;
    }
    standing += world.deeds[deed.deedId]?.standingDelta ?? 0;
  }
  return standing;
}
```

- [ ] **Step 4: Verify pass, export, full gate, commit**

Append to `packages/core/src/index.ts`:

```ts
export { factionStanding, npcStanding } from "./reputation.ts";
```

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Compute NPC and faction standing from the deed ledger"
```

## Task 8: Core — dialogue node lookup and visible choices

**Files:**

- Create: `packages/core/src/dialogue.ts`
- Test: `packages/core/src/dialogue.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing tests** — `packages/core/src/dialogue.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { currentNode, visibleChoices } from "./dialogue.ts";
import { createGameState, type GameState } from "./state.ts";
import { fixtureWorld } from "./world.fixture.ts";

const world = fixtureWorld();

function inDialogue(deeds: GameState["deeds"]): GameState {
  return {
    ...createGameState({ seed: 1, world }),
    dialogue: { npcId: "test:keeper", nodeId: "hello" },
    deeds,
  };
}

describe("currentNode", () => {
  it("returns undefined outside dialogue", () => {
    expect(currentNode(createGameState({ seed: 1, world }), world)).toBeUndefined();
  });

  it("returns the active node", () => {
    expect(currentNode(inDialogue([]), world)?.text).toBe("What'll it be?");
  });
});

describe("visibleChoices", () => {
  it("hides choices whose condition fails", () => {
    const texts = visibleChoices(inDialogue([]), world).map((choice) => choice.text);
    expect(texts).toEqual(["Compliment", "Insult", "Bye"]);
  });

  it("reveals choices once standing qualifies", () => {
    const state = inDialogue([{ deedId: "test:praise", npcId: "test:keeper", tick: 1 }]);
    const texts = visibleChoices(state, world).map((choice) => choice.text);
    expect(texts).toEqual(["Compliment", "Insult", "Secret?", "Bye"]);
  });

  it("returns no choices outside dialogue", () => {
    expect(visibleChoices(createGameState({ seed: 1, world }), world)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** (`pnpm test` — FAIL: cannot resolve `./dialogue.ts`)

- [ ] **Step 3: Write `packages/core/src/dialogue.ts`**

```ts
import type { DialogueChoice, DialogueCondition, DialogueNode, WorldDef } from "./defs.ts";
import { factionStanding, npcStanding } from "./reputation.ts";
import type { GameState } from "./state.ts";

export function currentNode(state: GameState, world: WorldDef): DialogueNode | undefined {
  if (state.dialogue === null) {
    return undefined;
  }
  const npc = world.npcs[state.dialogue.npcId];
  if (npc === undefined) {
    return undefined;
  }
  return world.dialogues[npc.dialogueId]?.nodes[state.dialogue.nodeId];
}

/**
 * The choices the player may pick right now, in authored order. `choose`
 * intents index into THIS array — core and client must both use it.
 */
export function visibleChoices(state: GameState, world: WorldDef): readonly DialogueChoice[] {
  const node = currentNode(state, world);
  if (node === undefined || state.dialogue === null) {
    return [];
  }
  const npcId = state.dialogue.npcId;
  return node.choices.filter(
    (choice) =>
      choice.condition === undefined || conditionMet(choice.condition, state, world, npcId),
  );
}

function conditionMet(
  condition: DialogueCondition,
  state: GameState,
  world: WorldDef,
  npcId: string,
): boolean {
  switch (condition.type) {
    case "npc-standing-at-least":
      return npcStanding(state, world, npcId) >= condition.value;
    case "npc-standing-below":
      return npcStanding(state, world, npcId) < condition.value;
    case "faction-standing-at-least":
    case "faction-standing-below": {
      const factionId = world.npcs[npcId]?.factionId;
      if (factionId === undefined) {
        return false;
      }
      const standing = factionStanding(state, world, factionId);
      return condition.type === "faction-standing-at-least"
        ? standing >= condition.value
        : standing < condition.value;
    }
  }
}
```

- [ ] **Step 4: Verify pass, export, full gate, commit**

Append to `packages/core/src/index.ts`:

```ts
export { currentNode, visibleChoices } from "./dialogue.ts";
```

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Add dialogue node lookup with condition-filtered choices"
```

## Task 9: Core — NPC movement (`npc.ts`, part 2)

**Files:**

- Modify: `packages/core/src/npc.ts`, `packages/core/src/index.ts`
- Test: `packages/core/src/npc.test.ts`

- [ ] **Step 1: Add failing tests** — append to `packages/core/src/npc.test.ts`

```ts
import { advanceNpcs } from "./npc.ts";
import { createGameState } from "./state.ts";
import { fixtureWorld } from "./world.fixture.ts";

describe("advanceNpcs", () => {
  const world = fixtureWorld();

  it("keeps NPCs at their posts while the schedule holds", () => {
    const state = createGameState({ seed: 1, world });
    const result = advanceNpcs({ npcs: state.npcs, playerPos: state.player.pos, world, tick: 5 });
    expect(result.npcs).toEqual(state.npcs);
    expect(result.events).toEqual([]);
  });

  it("takes one deterministic step when the schedule changes (golden)", () => {
    const state = createGameState({ seed: 1, world });
    // Tick 10 is 09:00 — the walker leaves a(6,1) for b(1,3); the fixed
    // neighbor order picks south into the east corridor.
    const result = advanceNpcs({ npcs: state.npcs, playerPos: state.player.pos, world, tick: 10 });
    expect(result.npcs).toContainEqual({ id: "test:walker", pos: { x: 6, y: 2 } });
    expect(result.events).toEqual([
      { type: "npc-moved", npcId: "test:walker", from: { x: 6, y: 1 }, to: { x: 6, y: 2 } },
    ]);
  });

  it("waits without moving when the next step is occupied by the player", () => {
    const state = createGameState({ seed: 1, world });
    const result = advanceNpcs({
      npcs: state.npcs,
      playerPos: { x: 6, y: 2 },
      world,
      tick: 10,
    });
    expect(result.npcs).toContainEqual({ id: "test:walker", pos: { x: 6, y: 1 } });
    expect(result.events).toEqual([]);
  });

  it("arrives at the new post within the hour", () => {
    const state = createGameState({ seed: 1, world });
    let npcs = state.npcs;
    for (let tick = 10; tick < 20; tick += 1) {
      npcs = advanceNpcs({ npcs, playerPos: state.player.pos, world, tick }).npcs;
    }
    expect(npcs).toContainEqual({ id: "test:walker", pos: { x: 1, y: 3 } });
    expect(npcs).toContainEqual({ id: "test:keeper", pos: { x: 4, y: 4 } });
  });
});
```

Merge the import lines with the existing ones at the top of the file (single import per module — oxlint enforces no duplicate imports).

- [ ] **Step 2: Run to verify failure** (`pnpm test` — FAIL: `advanceNpcs` not exported)

- [ ] **Step 3: Implement `advanceNpcs`** — append to `packages/core/src/npc.ts`

```ts
export function advanceNpcs(options: {
  readonly npcs: readonly NpcState[];
  readonly playerPos: Vec2;
  readonly world: WorldDef;
  readonly tick: number;
}): { readonly npcs: readonly NpcState[]; readonly events: readonly GameEvent[] } {
  const { world, tick } = options;
  const hour = hourOf(tick);
  const moved: NpcState[] = [...options.npcs];
  const events: GameEvent[] = [];
  const occupied = new Set<string>(moved.map((npc) => `${npc.pos.x},${npc.pos.y}`));
  occupied.add(`${options.playerPos.x},${options.playerPos.y}`);

  moved.forEach((npc, index) => {
    const def = world.npcs[npc.id];
    if (def === undefined) {
      return;
    }
    const location = scheduleTarget(def, hour);
    const target = location === undefined ? undefined : world.map.locations[location];
    if (target === undefined) {
      return;
    }
    const step = nextStep(world.map, npc.pos, target);
    if (step === undefined) {
      return;
    }
    const key = `${step.x},${step.y}`;
    if (occupied.has(key)) {
      return;
    }
    occupied.delete(`${npc.pos.x},${npc.pos.y}`);
    occupied.add(key);
    moved[index] = { id: npc.id, pos: step };
    events.push({ type: "npc-moved", npcId: npc.id, from: npc.pos, to: step });
  });

  return { npcs: moved, events };
}
```

Update the imports at the top of `npc.ts`:

```ts
import type { NpcDef, WorldDef } from "./defs.ts";
import type { GameEvent } from "./event.ts";
import { nextStep } from "./path.ts";
import type { NpcState, Vec2 } from "./state.ts";
import { hourOf } from "./time.ts";
```

This will not compile yet — `npc-moved` is not a `GameEvent` member. Add it now
(Task 10 adds the remaining events): in `packages/core/src/event.ts`, append

```ts
export interface NpcMovedEvent {
  readonly type: "npc-moved";
  readonly npcId: string;
  readonly from: Vec2;
  readonly to: Vec2;
}
```

and extend the union:

```ts
export type GameEvent = PlayerMovedEvent | MovementBlockedEvent | NpcMovedEvent;
```

- [ ] **Step 4: Verify pass, export, full gate, commit**

In `packages/core/src/index.ts`, replace the npc export line with:

```ts
export { advanceNpcs, scheduleTarget } from "./npc.ts";
```

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Move NPCs one BFS step per tick toward schedule targets"
```

## Task 10: Core — `advance()` v2: move, wait, talk, choose

**Files:**

- Modify: `packages/core/src/intent.ts`, `packages/core/src/event.ts`, `packages/core/src/advance.ts`, `packages/core/src/index.ts`
- Test: `packages/core/src/advance.test.ts` (full rewrite)

- [ ] **Step 1: Extend intents** — `packages/core/src/intent.ts` (append; keep existing content)

```ts
export interface WaitIntent {
  readonly type: "wait";
}

export interface TalkIntent {
  readonly type: "talk";
}

export interface ChooseIntent {
  readonly type: "choose";
  readonly index: number;
}
```

and replace the union:

```ts
export type Intent = MoveIntent | WaitIntent | TalkIntent | ChooseIntent;
```

- [ ] **Step 2: Extend events** — `packages/core/src/event.ts` (append)

```ts
export interface DialogueStartedEvent {
  readonly type: "dialogue-started";
  readonly npcId: string;
  readonly nodeId: string;
}

export interface DialogueAdvancedEvent {
  readonly type: "dialogue-advanced";
  readonly npcId: string;
  readonly nodeId: string;
}

export interface DialogueEndedEvent {
  readonly type: "dialogue-ended";
  readonly npcId: string;
}

export interface DeedRecordedEvent {
  readonly type: "deed-recorded";
  readonly deedId: string;
  readonly npcId: string;
}

export interface ReputationChangedEvent {
  readonly type: "reputation-changed";
  readonly npcId: string;
  readonly factionId: string;
  readonly npcStanding: number;
  readonly factionStanding: number;
}

export interface IntentRejectedEvent {
  readonly type: "intent-rejected";
  readonly reason: string;
}
```

and replace the union:

```ts
export type GameEvent =
  | PlayerMovedEvent
  | MovementBlockedEvent
  | NpcMovedEvent
  | DialogueStartedEvent
  | DialogueAdvancedEvent
  | DialogueEndedEvent
  | DeedRecordedEvent
  | ReputationChangedEvent
  | IntentRejectedEvent;
```

- [ ] **Step 3: Write the failing tests** — replace `packages/core/src/advance.test.ts` entirely

```ts
import { array, assert, constantFrom, property } from "fast-check";
import { describe, expect, it } from "vitest";
import { advance } from "./advance.ts";
import type { Intent } from "./intent.ts";
import { isBlocked } from "./map.ts";
import { createGameState, type GameState } from "./state.ts";
import { fixtureWorld } from "./world.fixture.ts";

const world = fixtureWorld();

function freshState(): GameState {
  return createGameState({ seed: 42, world });
}

function run(state: GameState, intents: readonly Intent[]): GameState {
  let current = state;
  for (const intent of intents) {
    current = advance(current, intent, world).state;
  }
  return current;
}

// Player (1,1) → (4,3), the tile above the keeper's nook.
const WALK_TO_KEEPER: readonly Intent[] = [
  { type: "move", direction: "south" },
  { type: "move", direction: "south" },
  { type: "move", direction: "east" },
  { type: "move", direction: "east" },
  { type: "move", direction: "east" },
];

describe("advance: move & wait", () => {
  it("moves the player into an open tile and ticks the clock", () => {
    const result = advance(freshState(), { type: "move", direction: "south" }, world);
    expect(result.state.player.pos).toEqual({ x: 1, y: 2 });
    expect(result.state.tick).toBe(1);
    expect(result.events).toEqual([
      { type: "player-moved", from: { x: 1, y: 1 }, to: { x: 1, y: 2 } },
    ]);
  });

  it("blocks movement into a wall, still ticking", () => {
    const result = advance(freshState(), { type: "move", direction: "north" }, world);
    expect(result.state.player.pos).toEqual({ x: 1, y: 1 });
    expect(result.state.tick).toBe(1);
    expect(result.events).toEqual([
      { type: "movement-blocked", at: { x: 1, y: 1 }, toward: { x: 1, y: 0 } },
    ]);
  });

  it("blocks movement into an NPC", () => {
    const atKeeperDoor = run(freshState(), WALK_TO_KEEPER);
    const result = advance(atKeeperDoor, { type: "move", direction: "south" }, world);
    expect(result.state.player.pos).toEqual({ x: 4, y: 3 });
    expect(result.events[0]?.type).toBe("movement-blocked");
  });

  it("wait advances time and lets NPCs act", () => {
    const state = run(
      freshState(),
      Array.from({ length: 10 }, () => ({ type: "wait" as const })),
    );
    expect(state.tick).toBe(10);
    const walker = state.npcs.find((npc) => npc.id === "test:walker");
    expect(walker?.pos).toEqual({ x: 6, y: 2 });
  });

  it("does not mutate the input state", () => {
    const state = freshState();
    advance(state, { type: "move", direction: "south" }, world);
    expect(state.player.pos).toEqual({ x: 1, y: 1 });
    expect(state.tick).toBe(0);
  });
});

describe("advance: talk & choose", () => {
  it("talk with no adjacent NPC is rejected without ticking", () => {
    const result = advance(freshState(), { type: "talk" }, world);
    expect(result.state.tick).toBe(0);
    expect(result.events[0]?.type).toBe("intent-rejected");
  });

  it("talk next to an NPC opens their dialogue at the start node", () => {
    const result = advance(run(freshState(), WALK_TO_KEEPER), { type: "talk" }, world);
    expect(result.state.dialogue).toEqual({ npcId: "test:keeper", nodeId: "hello" });
    expect(result.state.tick).toBe(5);
    expect(result.events).toEqual([
      { type: "dialogue-started", npcId: "test:keeper", nodeId: "hello" },
    ]);
  });

  it("move and wait are rejected during dialogue", () => {
    const talking = advance(run(freshState(), WALK_TO_KEEPER), { type: "talk" }, world).state;
    for (const intent of [{ type: "move", direction: "north" }, { type: "wait" }] as const) {
      const result = advance(talking, intent, world);
      expect(result.state).toEqual(talking);
      expect(result.events[0]?.type).toBe("intent-rejected");
    }
  });

  it("choosing an effectful choice records the deed and reports reputation", () => {
    const talking = advance(run(freshState(), WALK_TO_KEEPER), { type: "talk" }, world).state;
    const result = advance(talking, { type: "choose", index: 0 }, world);
    expect(result.state.deeds).toEqual([{ deedId: "test:praise", npcId: "test:keeper", tick: 5 }]);
    expect(result.state.dialogue).toEqual({ npcId: "test:keeper", nodeId: "smile" });
    expect(result.events).toEqual([
      { type: "deed-recorded", deedId: "test:praise", npcId: "test:keeper" },
      {
        type: "reputation-changed",
        npcId: "test:keeper",
        factionId: "test:guild",
        npcStanding: 10,
        factionStanding: 10,
      },
      { type: "dialogue-advanced", npcId: "test:keeper", nodeId: "smile" },
    ]);
  });

  it("a choice without next ends the dialogue", () => {
    const talking = advance(run(freshState(), WALK_TO_KEEPER), { type: "talk" }, world).state;
    const result = advance(talking, { type: "choose", index: 2 }, world);
    expect(result.state.dialogue).toBeNull();
    expect(result.events).toEqual([{ type: "dialogue-ended", npcId: "test:keeper" }]);
  });

  it("choose indexes into the visible (condition-filtered) choices", () => {
    // With +10 standing the hidden "Secret?" choice appears at index 2.
    const praised = advance(run(freshState(), WALK_TO_KEEPER), { type: "talk" }, world).state;
    const smiled = advance(praised, { type: "choose", index: 0 }, world).state;
    const ended = advance(smiled, { type: "choose", index: 0 }, world).state;
    const again = advance(ended, { type: "talk" }, world).state;
    const result = advance(again, { type: "choose", index: 2 }, world);
    expect(result.state.dialogue).toEqual({ npcId: "test:keeper", nodeId: "secret" });
  });

  it("an out-of-range choice is rejected", () => {
    const talking = advance(run(freshState(), WALK_TO_KEEPER), { type: "talk" }, world).state;
    const result = advance(talking, { type: "choose", index: 9 }, world);
    expect(result.state).toEqual(talking);
    expect(result.events[0]?.type).toBe("intent-rejected");
  });

  it("choose outside dialogue is rejected", () => {
    const result = advance(freshState(), { type: "choose", index: 0 }, world);
    expect(result.events[0]?.type).toBe("intent-rejected");
  });
});

const arbitraryIntent = constantFrom<Intent>(
  { type: "move", direction: "north" },
  { type: "move", direction: "south" },
  { type: "move", direction: "east" },
  { type: "move", direction: "west" },
  { type: "wait" },
  { type: "talk" },
  { type: "choose", index: 0 },
  { type: "choose", index: 1 },
);

describe("advance: properties", () => {
  it("is deterministic for any intent sequence", () => {
    assert(
      property(array(arbitraryIntent, { maxLength: 200 }), (intents) => {
        expect(JSON.stringify(run(freshState(), intents))).toBe(
          JSON.stringify(run(freshState(), intents)),
        );
      }),
    );
  });

  it("never places the player or an NPC on a blocked tile, never overlaps entities", () => {
    assert(
      property(array(arbitraryIntent, { maxLength: 200 }), (intents) => {
        let state = freshState();
        for (const intent of intents) {
          state = advance(state, intent, world).state;
          const tiles = [state.player.pos, ...state.npcs.map((npc) => npc.pos)];
          for (const pos of tiles) {
            expect(isBlocked(world.map, pos.x, pos.y)).toBe(false);
          }
          expect(new Set(tiles.map((pos) => `${pos.x},${pos.y}`)).size).toBe(tiles.length);
        }
      }),
    );
  });
});
```

- [ ] **Step 4: Run to verify failure** (`pnpm test` — FAIL: advance signature/behavior)

- [ ] **Step 5: Rewrite `packages/core/src/advance.ts`**

```ts
import type { WorldDef } from "./defs.ts";
import { visibleChoices } from "./dialogue.ts";
import type { GameEvent } from "./event.ts";
import { DIRECTION_DELTAS, type ChooseIntent, type Intent, type MoveIntent } from "./intent.ts";
import { isBlocked } from "./map.ts";
import { advanceNpcs } from "./npc.ts";
import { factionStanding, npcStanding } from "./reputation.ts";
import type { GameState, NpcState, Vec2 } from "./state.ts";

export interface AdvanceResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export function advance(state: GameState, intent: Intent, world: WorldDef): AdvanceResult {
  switch (intent.type) {
    case "move":
      return state.dialogue === null
        ? applyMove(state, intent, world)
        : rejected(state, "finish the conversation first");
    case "wait":
      return state.dialogue === null
        ? applyTick(state, state.player.pos, [], world)
        : rejected(state, "finish the conversation first");
    case "talk":
      return applyTalk(state, world);
    case "choose":
      return applyChoose(state, intent, world);
  }
}

function rejected(state: GameState, reason: string): AdvanceResult {
  return { state, events: [{ type: "intent-rejected", reason }] };
}

/** Every time-consuming intent funnels here: bump the tick, let NPCs act. */
function applyTick(
  state: GameState,
  playerPos: Vec2,
  events: readonly GameEvent[],
  world: WorldDef,
): AdvanceResult {
  const tick = state.tick + 1;
  const npcResult = advanceNpcs({ npcs: state.npcs, playerPos, world, tick });
  return {
    state: { ...state, tick, player: { pos: playerPos }, npcs: npcResult.npcs },
    events: [...events, ...npcResult.events],
  };
}

function applyMove(state: GameState, intent: MoveIntent, world: WorldDef): AdvanceResult {
  const delta = DIRECTION_DELTAS[intent.direction];
  const from = state.player.pos;
  const to = { x: from.x + delta.dx, y: from.y + delta.dy };
  const occupiedByNpc = state.npcs.some((npc) => npc.pos.x === to.x && npc.pos.y === to.y);
  if (isBlocked(world.map, to.x, to.y) || occupiedByNpc) {
    return applyTick(state, from, [{ type: "movement-blocked", at: from, toward: to }], world);
  }
  return applyTick(state, to, [{ type: "player-moved", from, to }], world);
}

function applyTalk(state: GameState, world: WorldDef): AdvanceResult {
  if (state.dialogue !== null) {
    return rejected(state, "already in a conversation");
  }
  const npc = adjacentNpc(state);
  if (npc === undefined) {
    return rejected(state, "no one within reach to talk to");
  }
  const def = world.npcs[npc.id];
  const dialogue = def === undefined ? undefined : world.dialogues[def.dialogueId];
  if (dialogue === undefined) {
    return rejected(state, `"${npc.id}" has nothing to say`);
  }
  return {
    state: { ...state, dialogue: { npcId: npc.id, nodeId: dialogue.start } },
    events: [{ type: "dialogue-started", npcId: npc.id, nodeId: dialogue.start }],
  };
}

function adjacentNpc(state: GameState): NpcState | undefined {
  const { x, y } = state.player.pos;
  for (const delta of Object.values(DIRECTION_DELTAS)) {
    const found = state.npcs.find(
      (npc) => npc.pos.x === x + delta.dx && npc.pos.y === y + delta.dy,
    );
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function applyChoose(state: GameState, intent: ChooseIntent, world: WorldDef): AdvanceResult {
  if (state.dialogue === null) {
    return rejected(state, "not in a conversation");
  }
  const npcId = state.dialogue.npcId;
  const choice = visibleChoices(state, world)[intent.index];
  if (choice === undefined) {
    return rejected(state, `there is no choice ${intent.index}`);
  }

  const events: GameEvent[] = [];
  let deeds = state.deeds;
  for (const effect of choice.effects ?? []) {
    deeds = [...deeds, { deedId: effect.deedId, npcId, tick: state.tick }];
    events.push({ type: "deed-recorded", deedId: effect.deedId, npcId });
  }

  const withDeeds: GameState = { ...state, deeds };
  const factionId = world.npcs[npcId]?.factionId;
  if (deeds !== state.deeds && factionId !== undefined) {
    events.push({
      type: "reputation-changed",
      npcId,
      factionId,
      npcStanding: npcStanding(withDeeds, world, npcId),
      factionStanding: factionStanding(withDeeds, world, factionId),
    });
  }

  if (choice.next === undefined) {
    events.push({ type: "dialogue-ended", npcId });
    return { state: { ...withDeeds, dialogue: null }, events };
  }
  events.push({ type: "dialogue-advanced", npcId, nodeId: choice.next });
  return { state: { ...withDeeds, dialogue: { npcId, nodeId: choice.next } }, events };
}
```

- [ ] **Step 6: Update index exports**

In `packages/core/src/index.ts`, replace the intent and event export lines with:

```ts
export {
  DIRECTION_DELTAS,
  type ChooseIntent,
  type Direction,
  type Intent,
  type MoveIntent,
  type TalkIntent,
  type WaitIntent,
} from "./intent.ts";
export type {
  DeedRecordedEvent,
  DialogueAdvancedEvent,
  DialogueEndedEvent,
  DialogueStartedEvent,
  GameEvent,
  IntentRejectedEvent,
  MovementBlockedEvent,
  NpcMovedEvent,
  PlayerMovedEvent,
  ReputationChangedEvent,
} from "./event.ts";
```

- [ ] **Step 7: Update the temporary client patch**

`advance` now takes a `WorldDef`, so in `packages/client/src/world-scene.ts`
(`apply()`), change

```ts
const result = advance(this.state, intent, this.map);
```

to

```ts
const result = advance(this.state, intent, this.tempWorld);
```

(`this.tempWorld` was added by Task 6's patch; Task 15 replaces the file.)

- [ ] **Step 8: Verify pass, full gate, commit**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Drive movement, waiting, and dialogue through advance()"
```

## Task 11: Core — scenario harness (`harness.ts`)

The spec's primary verification tool (§5): script intents against a fixture world, assert on state and events. Doubles as living documentation of the M2 loop.

**Files:**

- Create: `packages/core/src/harness.ts`
- Test: `packages/core/src/harness.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test** — `packages/core/src/harness.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { runScenario } from "./harness.ts";
import type { Intent } from "./intent.ts";
import { fixtureWorld } from "./world.fixture.ts";

const WALK_TO_KEEPER: readonly Intent[] = [
  { type: "move", direction: "south" },
  { type: "move", direction: "south" },
  { type: "move", direction: "east" },
  { type: "move", direction: "east" },
  { type: "move", direction: "east" },
];

describe("scenario: flattery opens doors", () => {
  it("praising the keeper unlocks their secret and lifts guild standing", () => {
    const { state, events } = runScenario({
      world: fixtureWorld(),
      seed: 7,
      intents: [
        ...WALK_TO_KEEPER,
        { type: "talk" },
        { type: "choose", index: 0 }, // Compliment (+10, → smile)
        { type: "choose", index: 0 }, // Bye (end)
        { type: "talk" },
        { type: "choose", index: 2 }, // Secret? — visible only at standing ≥ 10
      ],
    });
    expect(state.dialogue).toEqual({ npcId: "test:keeper", nodeId: "secret" });
    expect(events).toContainEqual({
      type: "reputation-changed",
      npcId: "test:keeper",
      factionId: "test:guild",
      npcStanding: 10,
      factionStanding: 10,
    });
  });

  it("insulting the keeper keeps the secret hidden", () => {
    const { state } = runScenario({
      world: fixtureWorld(),
      seed: 7,
      intents: [
        ...WALK_TO_KEEPER,
        { type: "talk" },
        { type: "choose", index: 1 }, // Insult (-10, ends)
        { type: "talk" },
        { type: "choose", index: 2 }, // now "Bye" — Secret? stays hidden
      ],
    });
    expect(state.dialogue).toBeNull();
    expect(state.deeds).toContainEqual({ deedId: "test:slight", npcId: "test:keeper", tick: 5 });
  });
});
```

(Second scenario: at standing −10 the visible list is [Compliment, Insult, Bye], so
index 2 is "Bye", which ends the dialogue — proving the gated line stayed hidden.)

- [ ] **Step 2: Run to verify failure** (`pnpm test` — FAIL: cannot resolve `./harness.ts`)

- [ ] **Step 3: Write `packages/core/src/harness.ts`**

```ts
import { advance } from "./advance.ts";
import type { WorldDef } from "./defs.ts";
import type { GameEvent } from "./event.ts";
import type { Intent } from "./intent.ts";
import { createGameState, type GameState } from "./state.ts";

export interface ScenarioResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/**
 * Headless scenario runner: fold a scripted intent sequence over a fresh
 * world and collect every emitted event. The primary verification tool for
 * behavior-level tests ("insulting the merchant sours the guild").
 */
export function runScenario(options: {
  readonly world: WorldDef;
  readonly seed: number;
  readonly intents: readonly Intent[];
}): ScenarioResult {
  let state = createGameState({ seed: options.seed, world: options.world });
  const events: GameEvent[] = [];
  for (const intent of options.intents) {
    const result = advance(state, intent, options.world);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}
```

- [ ] **Step 4: Verify pass, export, full gate, commit**

Append to `packages/core/src/index.ts`:

```ts
export { runScenario, type ScenarioResult } from "./harness.ts";
```

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Add headless scenario harness for behavior-level tests"
```

## Task 12: Content — object schemas and `parsePackObjects`

**Files:**

- Modify: `packages/content/src/schemas.ts`, `packages/content/src/loader.ts`, `packages/content/src/index.ts`
- Test: `packages/content/src/loader.test.ts`

- [ ] **Step 1: Add failing tests** — append to `packages/content/src/loader.test.ts`

```ts
import { parsePackObjects } from "./loader.ts";

const faction = { type: "faction", id: "base:merchants_guild", name: "The Merchants' Guild" };
const deed = { type: "deed", id: "base:insult", name: "An insult", standingDelta: -10 };
const npc = {
  type: "npc",
  id: "base:tavernkeeper",
  name: "Marisol",
  faction: "base:merchants_guild",
  dialogue: "base:tavernkeeper_talk",
  schedule: [{ hour: 0, location: "tavern_bar" }],
};
const dialogue = {
  type: "dialogue",
  id: "base:tavernkeeper_talk",
  start: "greeting",
  nodes: {
    greeting: {
      text: "What'll it be?",
      choices: [{ text: "Nothing.", effects: [{ type: "deed", deed: "base:insult" }] }],
    },
  },
};

describe("parsePackObjects", () => {
  it("parses one of each object type", () => {
    const objects = parsePackObjects([faction, deed, npc, dialogue], "social.json");
    expect(objects.map((object) => object.type)).toEqual(["faction", "deed", "npc", "dialogue"]);
  });

  it("rejects a non-array payload", () => {
    expect(() => parsePackObjects({ nope: true }, "bad.json")).toThrow(/bad\.json.*array/);
  });

  it("names the file, index, and field in errors", () => {
    const { name: _dropped, ...broken } = npc;
    expect(() => parsePackObjects([faction, broken], "social.json")).toThrow(
      /social\.json\[1\][\s\S]*name/,
    );
  });

  it("rejects ids that are not namespaced snake_case", () => {
    expect(() => parsePackObjects([{ ...faction, id: "MerchantsGuild" }], "f.json")).toThrow(
      /namespaced/,
    );
  });

  it("rejects unknown object types", () => {
    expect(() => parsePackObjects([{ type: "spaceship", id: "base:x" }], "f.json")).toThrow(
      /f\.json\[0\]/,
    );
  });

  it("rejects unknown fields (strict schemas)", () => {
    expect(() => parsePackObjects([{ ...deed, sneaky: true }], "d.json")).toThrow(/sneaky/);
  });

  it("rejects schedule hours outside 0-23", () => {
    const late = { ...npc, schedule: [{ hour: 24, location: "tavern_bar" }] };
    expect(() => parsePackObjects([late], "n.json")).toThrow(/hour/);
  });
});
```

(Merge the `import` with the existing one at the top of the file.)

- [ ] **Step 2: Run to verify failure** (`pnpm test` — FAIL: `parsePackObjects` not exported)

- [ ] **Step 3: Extend `packages/content/src/schemas.ts`** (append)

```ts
const objectId = z
  .string()
  .regex(
    /^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/,
    'object ids are namespaced snake_case, e.g. "base:tavernkeeper"',
  );

export const factionSchema = z.strictObject({
  type: z.literal("faction"),
  id: objectId,
  name: z.string().min(1),
});

export const deedSchema = z.strictObject({
  type: z.literal("deed"),
  id: objectId,
  name: z.string().min(1),
  standingDelta: z.number().int(),
});

const scheduleEntrySchema = z.strictObject({
  hour: z.number().int().min(0).max(23),
  location: z.string().min(1),
});

export const npcSchema = z.strictObject({
  type: z.literal("npc"),
  id: objectId,
  name: z.string().min(1),
  faction: objectId,
  dialogue: objectId,
  schedule: z.array(scheduleEntrySchema).min(1),
});

const conditionSchema = z.strictObject({
  type: z.enum([
    "npc-standing-at-least",
    "npc-standing-below",
    "faction-standing-at-least",
    "faction-standing-below",
  ]),
  value: z.number().int(),
});

const effectSchema = z.strictObject({
  type: z.literal("deed"),
  deed: objectId,
});

const choiceSchema = z.strictObject({
  text: z.string().min(1),
  next: z.string().min(1).optional(),
  condition: conditionSchema.optional(),
  effects: z.array(effectSchema).optional(),
});

const nodeSchema = z.strictObject({
  text: z.string().min(1),
  choices: z.array(choiceSchema).min(1),
});

export const dialogueSchema = z.strictObject({
  type: z.literal("dialogue"),
  id: objectId,
  start: z.string().min(1),
  nodes: z.record(z.string(), nodeSchema),
});

export const packObjectSchema = z.discriminatedUnion("type", [
  factionSchema,
  deedSchema,
  npcSchema,
  dialogueSchema,
]);

export type FactionObject = z.infer<typeof factionSchema>;
export type DeedObject = z.infer<typeof deedSchema>;
export type NpcObject = z.infer<typeof npcSchema>;
export type DialogueObject = z.infer<typeof dialogueSchema>;
export type PackObject = z.infer<typeof packObjectSchema>;
```

- [ ] **Step 4: Add `parsePackObjects`** — append to `packages/content/src/loader.ts`

```ts
export function parsePackObjects(raw: unknown, source: string): readonly PackObject[] {
  if (!Array.isArray(raw)) {
    throw new ContentError(`${source}: expected a JSON array of content objects`);
  }
  return raw.map((entry, index) => {
    const result = packObjectSchema.safeParse(entry);
    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("\n");
      throw new ContentError(`${source}[${index}]: invalid content object\n${details}`);
    }
    return result.data;
  });
}
```

and update the import at the top of `loader.ts`:

```ts
import {
  packManifestSchema,
  packObjectSchema,
  type PackManifest,
  type PackObject,
} from "./schemas.ts";
```

- [ ] **Step 5: Verify pass, export, full gate, commit**

Replace `packages/content/src/index.ts` with:

```ts
export { ContentError, parsePackManifest, parsePackObjects } from "./loader.ts";
export {
  packManifestSchema,
  packObjectSchema,
  type DeedObject,
  type DialogueObject,
  type FactionObject,
  type NpcObject,
  type PackManifest,
  type PackObject,
} from "./schemas.ts";
```

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Add Zod schemas for faction, deed, NPC, and dialogue objects"
```

## Task 13: Content — link pass (`finalizeWorld`)

**Files:**

- Create: `packages/content/src/finalize.ts`
- Test: `packages/content/src/finalize.test.ts`
- Modify: `packages/content/src/index.ts`

- [ ] **Step 1: Write the failing tests** — `packages/content/src/finalize.test.ts`

```ts
import type { MapModel } from "@pirata/core";
import { describe, expect, it } from "vitest";
import { finalizeWorld } from "./finalize.ts";
import { ContentError } from "./loader.ts";
import type { PackObject } from "./schemas.ts";

const map: MapModel = {
  id: "town",
  width: 3,
  height: 1,
  blocked: [false, false, false],
  playerSpawn: { x: 0, y: 0 },
  locations: { market: { x: 1, y: 0 } },
};

function objects(): PackObject[] {
  return [
    { type: "faction", id: "base:guild", name: "The Guild" },
    { type: "deed", id: "base:insult", name: "An insult", standingDelta: -10 },
    {
      type: "npc",
      id: "base:merchant",
      name: "Beatriz",
      faction: "base:guild",
      dialogue: "base:merchant_talk",
      schedule: [{ hour: 8, location: "market" }],
    },
    {
      type: "dialogue",
      id: "base:merchant_talk",
      start: "greeting",
      nodes: {
        greeting: {
          text: "Looking or buying?",
          choices: [
            { text: "Rude remark.", effects: [{ type: "deed", deed: "base:insult" }], next: "end" },
            { text: "Leaving." },
          ],
        },
        end: { text: "Hmph.", choices: [{ text: "Bye" }] },
      },
    },
  ];
}

describe("finalizeWorld", () => {
  it("builds a WorldDef with resolved references", () => {
    const world = finalizeWorld({ objects: objects(), map });
    expect(world.npcs["base:merchant"]?.factionId).toBe("base:guild");
    expect(world.npcs["base:merchant"]?.dialogueId).toBe("base:merchant_talk");
    expect(world.dialogues["base:merchant_talk"]?.nodes["greeting"]?.choices[0]?.effects).toEqual([
      { type: "deed", deedId: "base:insult" },
    ]);
  });

  it("rejects duplicate ids", () => {
    const dupes = [...objects(), { type: "faction", id: "base:guild", name: "Again" } as const];
    expect(() => finalizeWorld({ objects: dupes, map })).toThrow(/duplicate.*base:guild/);
  });

  it("rejects an unknown faction reference", () => {
    const broken = objects().map((object) =>
      object.type === "npc" ? { ...object, faction: "base:ghosts" } : object,
    );
    expect(() => finalizeWorld({ objects: broken, map })).toThrow(/base:ghosts/);
  });

  it("rejects an unknown dialogue reference", () => {
    const broken = objects().map((object) =>
      object.type === "npc" ? { ...object, dialogue: "base:silence" } : object,
    );
    expect(() => finalizeWorld({ objects: broken, map })).toThrow(/base:silence/);
  });

  it("rejects an unknown deed in an effect", () => {
    const broken = objects().filter((object) => object.type !== "deed");
    expect(() => finalizeWorld({ objects: broken, map })).toThrow(/base:insult/);
  });

  it("rejects a missing start node", () => {
    const broken = objects().map((object) =>
      object.type === "dialogue" ? { ...object, start: "nowhere" } : object,
    );
    expect(() => finalizeWorld({ objects: broken, map })).toThrow(/nowhere/);
  });

  it("rejects a dangling next reference", () => {
    const broken = objects().map((object) => {
      if (object.type !== "dialogue") {
        return object;
      }
      const greeting = object.nodes["greeting"];
      if (greeting === undefined) {
        return object;
      }
      return {
        ...object,
        nodes: {
          ...object.nodes,
          greeting: { ...greeting, choices: [{ text: "Onward.", next: "missing" }] },
        },
      };
    });
    expect(() => finalizeWorld({ objects: broken, map })).toThrow(/missing/);
  });

  it("rejects a node whose choices are all conditioned", () => {
    const broken = objects().map((object) => {
      if (object.type !== "dialogue") {
        return object;
      }
      const end = object.nodes["end"];
      if (end === undefined) {
        return object;
      }
      return {
        ...object,
        nodes: {
          ...object.nodes,
          end: {
            ...end,
            choices: [
              { text: "Gated.", condition: { type: "npc-standing-at-least" as const, value: 5 } },
            ],
          },
        },
      };
    });
    expect(() => finalizeWorld({ objects: broken, map })).toThrow(/unconditioned/);
  });

  it("rejects schedule hours that are not strictly increasing", () => {
    const broken = objects().map((object) =>
      object.type === "npc"
        ? {
            ...object,
            schedule: [
              { hour: 8, location: "market" },
              { hour: 8, location: "market" },
            ],
          }
        : object,
    );
    expect(() => finalizeWorld({ objects: broken, map })).toThrow(/strictly increasing/);
  });

  it("rejects a schedule location missing from the map", () => {
    const broken = objects().map((object) =>
      object.type === "npc" ? { ...object, schedule: [{ hour: 8, location: "moon" }] } : object,
    );
    expect(() => finalizeWorld({ objects: broken, map })).toThrow(/moon/);
  });

  it("wraps every failure in ContentError", () => {
    expect(() => finalizeWorld({ objects: [], map })).not.toThrow();
    const dupes = [...objects(), { type: "faction", id: "base:guild", name: "Again" } as const];
    expect(() => finalizeWorld({ objects: dupes, map })).toThrow(ContentError);
  });
});
```

- [ ] **Step 2: Run to verify failure** (`pnpm test` — FAIL: cannot resolve `./finalize.ts`)

- [ ] **Step 3: Write `packages/content/src/finalize.ts`**

```ts
import type {
  DeedDef,
  DialogueDef,
  DialogueNode,
  FactionDef,
  MapModel,
  NpcDef,
  WorldDef,
} from "@pirata/core";
import { ContentError } from "./loader.ts";
import type { DialogueObject, PackObject } from "./schemas.ts";

/**
 * The link pass (spec §4.4 "finalization"): index every object by id, resolve
 * every cross-reference, and fail loudly on anything dangling. The returned
 * WorldDef is the only thing core ever sees.
 */
export function finalizeWorld(options: {
  readonly objects: readonly PackObject[];
  readonly map: MapModel;
}): WorldDef {
  const factions: Record<string, FactionDef> = {};
  const deeds: Record<string, DeedDef> = {};
  const dialogues: Record<string, DialogueDef> = {};
  const npcs: Record<string, NpcDef> = {};

  for (const object of options.objects) {
    switch (object.type) {
      case "faction":
        assertNewId(factions, object.id, "faction");
        factions[object.id] = { id: object.id, name: object.name };
        break;
      case "deed":
        assertNewId(deeds, object.id, "deed");
        deeds[object.id] = {
          id: object.id,
          name: object.name,
          standingDelta: object.standingDelta,
        };
        break;
      case "dialogue":
        assertNewId(dialogues, object.id, "dialogue");
        dialogues[object.id] = toDialogueDef(object);
        break;
      case "npc":
        assertNewId(npcs, object.id, "npc");
        npcs[object.id] = {
          id: object.id,
          name: object.name,
          factionId: object.faction,
          dialogueId: object.dialogue,
          schedule: object.schedule,
        };
        break;
    }
  }

  for (const npc of Object.values(npcs)) {
    if (factions[npc.factionId] === undefined) {
      throw new ContentError(`npc "${npc.id}": unknown faction "${npc.factionId}"`);
    }
    if (dialogues[npc.dialogueId] === undefined) {
      throw new ContentError(`npc "${npc.id}": unknown dialogue "${npc.dialogueId}"`);
    }
    for (let i = 1; i < npc.schedule.length; i += 1) {
      const previous = npc.schedule[i - 1];
      const current = npc.schedule[i];
      if (previous !== undefined && current !== undefined && current.hour <= previous.hour) {
        throw new ContentError(`npc "${npc.id}": schedule hours must be strictly increasing`);
      }
    }
    for (const entry of npc.schedule) {
      if (options.map.locations[entry.location] === undefined) {
        throw new ContentError(
          `npc "${npc.id}": schedule location "${entry.location}" is not on map "${options.map.id}"`,
        );
      }
    }
  }

  for (const dialogue of Object.values(dialogues)) {
    if (dialogue.nodes[dialogue.start] === undefined) {
      throw new ContentError(
        `dialogue "${dialogue.id}": start node "${dialogue.start}" does not exist`,
      );
    }
    for (const [nodeId, node] of Object.entries(dialogue.nodes)) {
      if (!node.choices.some((choice) => choice.condition === undefined)) {
        throw new ContentError(
          `dialogue "${dialogue.id}" node "${nodeId}": needs at least one unconditioned choice so the player can always exit`,
        );
      }
      for (const choice of node.choices) {
        if (choice.next !== undefined && dialogue.nodes[choice.next] === undefined) {
          throw new ContentError(
            `dialogue "${dialogue.id}" node "${nodeId}": choice "${choice.text}" points to missing node "${choice.next}"`,
          );
        }
        for (const effect of choice.effects ?? []) {
          if (deeds[effect.deedId] === undefined) {
            throw new ContentError(
              `dialogue "${dialogue.id}" node "${nodeId}": choice "${choice.text}" references unknown deed "${effect.deedId}"`,
            );
          }
        }
      }
    }
  }

  return { map: options.map, factions, npcs, dialogues, deeds };
}

function assertNewId(bucket: Record<string, unknown>, id: string, kind: string): void {
  if (bucket[id] !== undefined) {
    throw new ContentError(`duplicate ${kind} id "${id}"`);
  }
}

function toDialogueDef(object: DialogueObject): DialogueDef {
  const nodes: Record<string, DialogueNode> = {};
  for (const [nodeId, node] of Object.entries(object.nodes)) {
    nodes[nodeId] = {
      text: node.text,
      choices: node.choices.map((choice) => ({
        text: choice.text,
        ...(choice.next !== undefined ? { next: choice.next } : {}),
        ...(choice.condition !== undefined ? { condition: choice.condition } : {}),
        ...(choice.effects !== undefined
          ? {
              effects: choice.effects.map((effect) => ({
                type: "deed" as const,
                deedId: effect.deed,
              })),
            }
          : {}),
      })),
    };
  }
  return { id: object.id, start: object.start, nodes };
}
```

(The conditional spreads exist because `exactOptionalPropertyTypes` forbids assigning
`undefined` to optional properties.)

- [ ] **Step 4: Verify pass, export, full gate, commit**

Append to `packages/content/src/index.ts`:

```ts
export { finalizeWorld } from "./finalize.ts";
```

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Add link pass resolving all content cross-references"
```

## Task 14: Content — base pack: town rework, social objects, `loadBaseWorld`

**Files:**

- Modify: `scripts/build-town-map.ts`, `packages/content/packs/base/pack.json`, `packages/content/src/validate.ts`, `packages/content/src/index.ts`
- Create: `packages/content/packs/base/factions.json`, `packages/content/packs/base/deeds.json`, `packages/content/packs/base/npcs.json`, `packages/content/packs/base/dialogues.json`, `packages/content/src/base.ts`
- Regenerate: `packages/content/packs/base/maps/port_town.map.json`
- Test: `packages/content/src/base.test.ts`

- [ ] **Step 1: Rework the town** — in `scripts/build-town-map.ts`, replace `LAYOUT` and add the location legend

The town gains doors (buildings were sealed boxes in M1) and six named locations.
Legend additions: uppercase letters are walkable ground carrying a named location.

```ts
const LAYOUT: readonly string[] = [
  "########################",
  "#................~~~~~~#",
  "#.####..####.....~~~~~~#",
  "#.#BH#..#M.#.....~~~~~~#",
  "#.#C.#..##.#......~~~~~#",
  "#.##.#...........P..~~~#",
  "#.................~~~~~#",
  "#.####..####......~~~~~#",
  "#.#..#..#..#......~~~~~#",
  "#.#..#..##.#......~~~~~#",
  "#.##.#...........N~~~~~#",
  "#................S~~~~~#",
  "#.......####.......~~~~#",
  "#.......#..#.......~~~~#",
  "#.......##.#......~~~~~#",
  "########################",
];

const LOCATION_LEGEND: Readonly<Record<string, string>> = {
  B: "tavern_bar",
  H: "tavern_hearth",
  C: "tavern_corner",
  M: "market",
  N: "dock_north",
  S: "dock_south",
};
```

In the layout loop, treat legend letters as open ground and collect their positions
(replace the existing `LAYOUT.forEach` body):

```ts
const locations: { name: string; x: number; y: number }[] = [];

LAYOUT.forEach((row, y) => {
  [...row].forEach((ch, x) => {
    ground.push(GID_GROUND);
    if (ch === "#") {
      walls.push(GID_WALL);
    } else if (ch === "~") {
      walls.push(GID_WATER);
    } else {
      walls.push(0);
    }
    if (ch === "P") {
      spawn = { x, y };
    }
    const locationName = LOCATION_LEGEND[ch];
    if (locationName !== undefined) {
      locations.push({ name: locationName, x, y });
    }
  });
});
```

In the `map` object literal, bump `nextlayerid` to `5`, set `nextobjectid` to
`2 + locations.length`, and append a fourth layer after `spawns`:

```ts
    {
      id: 4,
      name: "locations",
      type: "objectgroup",
      objects: locations.map((location, index) => ({
        id: 2 + index,
        name: location.name,
        x: location.x * TILE,
        y: location.y * TILE,
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

- [ ] **Step 2: Regenerate the map**

```bash
pnpm build:maps
```

Expected: `wrote packages/content/packs/base/maps/port_town.map.json (24x16, spawn at 17,5)`.

Geometry facts the rest of this plan (and the e2e suite) relies on — verify by
reading the layout, not the JSON: tavern interior tiles B(3,3), H(4,3), C(3,4) with
door at (4,5); market M(9,3) inside the trading house, door at (10,4); docks
N(17,10), S(17,11) beside the water; player spawn P(17,5).

- [ ] **Step 3: Write the base pack social objects**

`packages/content/packs/base/factions.json`:

```json
[
  { "type": "faction", "id": "base:merchants_guild", "name": "The Merchants' Guild" },
  { "type": "faction", "id": "base:dockworkers", "name": "The Dockworkers' Fellowship" }
]
```

`packages/content/packs/base/deeds.json`:

```json
[
  { "type": "deed", "id": "base:kind_word", "name": "A kind word", "standingDelta": 5 },
  { "type": "deed", "id": "base:lent_a_hand", "name": "Lent a hand", "standingDelta": 10 },
  {
    "type": "deed",
    "id": "base:stood_a_round",
    "name": "Stood a round of drinks",
    "standingDelta": 15
  },
  { "type": "deed", "id": "base:insult", "name": "An insult", "standingDelta": -10 }
]
```

`packages/content/packs/base/npcs.json`:

```json
[
  {
    "type": "npc",
    "id": "base:tavernkeeper",
    "name": "Marisol",
    "faction": "base:merchants_guild",
    "dialogue": "base:tavernkeeper_talk",
    "schedule": [{ "hour": 0, "location": "tavern_bar" }]
  },
  {
    "type": "npc",
    "id": "base:merchant",
    "name": "Beatriz",
    "faction": "base:merchants_guild",
    "dialogue": "base:merchant_talk",
    "schedule": [
      { "hour": 8, "location": "market" },
      { "hour": 19, "location": "tavern_corner" }
    ]
  },
  {
    "type": "npc",
    "id": "base:harbormaster",
    "name": "Duarte",
    "faction": "base:dockworkers",
    "dialogue": "base:harbormaster_talk",
    "schedule": [
      { "hour": 6, "location": "dock_north" },
      { "hour": 20, "location": "tavern_hearth" }
    ]
  },
  {
    "type": "npc",
    "id": "base:stevedore",
    "name": "Jorge",
    "faction": "base:dockworkers",
    "dialogue": "base:stevedore_talk",
    "schedule": [
      { "hour": 5, "location": "dock_south" },
      { "hour": 12, "location": "market" },
      { "hour": 17, "location": "dock_south" }
    ]
  }
]
```

(Jorge's noon trip to the market is deliberate: the market tile is occupied by
Beatriz, so he walks over and _waits adjacent_ — the contention rule read as social
behavior. At 08:00, everyone's posts are distinct, so spawning is conflict-free.)

`packages/content/packs/base/dialogues.json`:

```json
[
  {
    "type": "dialogue",
    "id": "base:tavernkeeper_talk",
    "start": "greeting",
    "nodes": {
      "greeting": {
        "text": "What'll it be, stranger?",
        "choices": [
          {
            "text": "A round for the house, on me.",
            "effects": [{ "type": "deed", "deed": "base:stood_a_round" }],
            "next": "cheers"
          },
          {
            "text": "Any word around town, friend?",
            "condition": { "type": "faction-standing-at-least", "value": 25 },
            "next": "gossip"
          },
          {
            "text": "About earlier — no offense meant.",
            "condition": { "type": "npc-standing-below", "value": 0 },
            "effects": [{ "type": "deed", "deed": "base:kind_word" }],
            "next": "cold"
          },
          { "text": "Nothing for now." },
          {
            "text": "This place smells of bilgewater.",
            "effects": [{ "type": "deed", "deed": "base:insult" }]
          }
        ]
      },
      "cheers": {
        "text": "The room cheers your name. Marisol almost smiles.",
        "choices": [{ "text": "Until next time." }]
      },
      "gossip": {
        "text": "Between us — the harbormaster pays double for hands that keep quiet.",
        "choices": [{ "text": "Good to know." }]
      },
      "cold": {
        "text": "Marisol wipes a mug and says nothing.",
        "choices": [{ "text": "Right." }]
      }
    }
  },
  {
    "type": "dialogue",
    "id": "base:merchant_talk",
    "start": "greeting",
    "nodes": {
      "greeting": {
        "text": "Fine goods, fair prices. Looking or buying?",
        "choices": [
          {
            "text": "Finest stall on the island, señora.",
            "effects": [{ "type": "deed", "deed": "base:kind_word" }],
            "next": "flattered"
          },
          {
            "text": "What do you hear on the docks?",
            "condition": { "type": "npc-standing-at-least", "value": 15 },
            "next": "confide"
          },
          { "text": "Just looking." },
          {
            "text": "Fair prices? Robbery, more like.",
            "effects": [{ "type": "deed", "deed": "base:insult" }]
          }
        ]
      },
      "flattered": {
        "text": "Beatriz laughs. 'Flattery is free — today.'",
        "choices": [{ "text": "Good day." }]
      },
      "confide": {
        "text": "'The guild inspects the warehouse on firstday. Make of that what you will.'",
        "choices": [{ "text": "Noted." }]
      }
    }
  },
  {
    "type": "dialogue",
    "id": "base:harbormaster_talk",
    "start": "greeting",
    "nodes": {
      "greeting": {
        "text": "State your business on my dock.",
        "choices": [
          {
            "text": "Lend a hand with the cargo.",
            "effects": [{ "type": "deed", "deed": "base:lent_a_hand" }],
            "next": "thanks"
          },
          {
            "text": "Anything moving tonight?",
            "condition": { "type": "faction-standing-at-least", "value": 20 },
            "next": "hint"
          },
          { "text": "Nothing. Just passing through." },
          {
            "text": "Out of my way, old man.",
            "effects": [{ "type": "deed", "deed": "base:insult" }]
          }
        ]
      },
      "thanks": {
        "text": "Duarte grunts what might be approval.",
        "choices": [{ "text": "Anytime." }]
      },
      "hint": {
        "text": "Keep clear of the north pier after dark. That's all I'll say.",
        "choices": [{ "text": "Understood." }]
      }
    }
  },
  {
    "type": "dialogue",
    "id": "base:stevedore_talk",
    "start": "greeting",
    "nodes": {
      "greeting": {
        "text": "Long days, short pay. You need something?",
        "choices": [
          {
            "text": "Here's to honest work.",
            "effects": [{ "type": "deed", "deed": "base:kind_word" }],
            "next": "nod"
          },
          { "text": "No. Carry on." }
        ]
      },
      "nod": {
        "text": "Jorge nods, a little less tired.",
        "choices": [{ "text": "Take care." }]
      }
    }
  }
]
```

Bump `packages/content/packs/base/pack.json` `"version"` to `"0.2.0"`.

- [ ] **Step 4: Write the failing base-pack test** — `packages/content/src/base.test.ts`

```ts
import { createGameState } from "@pirata/core";
import { describe, expect, it } from "vitest";
import { loadBaseWorld } from "./base.ts";

describe("base pack", () => {
  it("loads, links, and boots a fresh game", () => {
    const world = loadBaseWorld();
    expect(Object.keys(world.npcs)).toHaveLength(4);
    expect(Object.keys(world.factions)).toHaveLength(2);
    const state = createGameState({ seed: 1, world });
    expect(state.npcs).toContainEqual({ id: "base:tavernkeeper", pos: { x: 3, y: 3 } });
    expect(state.npcs).toContainEqual({ id: "base:merchant", pos: { x: 9, y: 3 } });
    expect(state.npcs).toContainEqual({ id: "base:harbormaster", pos: { x: 17, y: 10 } });
    expect(state.npcs).toContainEqual({ id: "base:stevedore", pos: { x: 17, y: 11 } });
  });
});
```

- [ ] **Step 5: Run to verify failure** (`pnpm test` — FAIL: cannot resolve `./base.ts`)

- [ ] **Step 6: Write `packages/content/src/base.ts`**

```ts
import deedsJson from "@pirata/content/packs/base/deeds.json" with { type: "json" };
import dialoguesJson from "@pirata/content/packs/base/dialogues.json" with { type: "json" };
import factionsJson from "@pirata/content/packs/base/factions.json" with { type: "json" };
import townJson from "@pirata/content/packs/base/maps/port_town.map.json" with { type: "json" };
import npcsJson from "@pirata/content/packs/base/npcs.json" with { type: "json" };
import { parseTiledMap, type WorldDef } from "@pirata/core";
import { finalizeWorld } from "./finalize.ts";
import { parsePackObjects } from "./loader.ts";

/** The base game, loaded through the same pipeline any mod pack would use. */
export function loadBaseWorld(): WorldDef {
  const objects = [
    ...parsePackObjects(factionsJson, "packs/base/factions.json"),
    ...parsePackObjects(deedsJson, "packs/base/deeds.json"),
    ...parsePackObjects(npcsJson, "packs/base/npcs.json"),
    ...parsePackObjects(dialoguesJson, "packs/base/dialogues.json"),
  ];
  return finalizeWorld({ objects, map: parseTiledMap("port_town", townJson) });
}
```

The self-referencing `@pirata/content/packs/...` specifiers resolve through this
package's own `exports` map and work under Node, Vite, and vitest; the
`with { type: "json" }` attribute is required by Node's native JSON modules and
harmless to Vite. **Fallback if any of the three toolchains refuses these imports:**
switch to relative `../packs/base/*.json` specifiers with a justification comment
(package self-reference unsupported), keeping everything else identical.

- [ ] **Step 7: Update `validate.ts`** — replace `packages/content/src/validate.ts`

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createGameState, parseTiledMap, type MapModel } from "@pirata/core";
import { finalizeWorld } from "./finalize.ts";
import { parsePackManifest, parsePackObjects } from "./loader.ts";

const packDir = process.argv[2] ?? "packages/content/packs/base";
const manifestPath = join(packDir, "pack.json");
const manifest = parsePackManifest(JSON.parse(readFileSync(manifestPath, "utf8")), manifestPath);

const mapsDir = join(packDir, "maps");
const maps: MapModel[] = readdirSync(mapsDir)
  .filter((file) => file.endsWith(".map.json"))
  .map((file) => {
    const raw: unknown = JSON.parse(readFileSync(join(mapsDir, file), "utf8"));
    return parseTiledMap(file.replace(".map.json", ""), raw);
  });
const townMap = maps[0];
if (townMap === undefined || maps.length !== 1) {
  console.error(`${mapsDir}: expected exactly one map, found ${String(maps.length)}`);
  process.exit(1);
}

const objects = readdirSync(packDir)
  .filter((file) => file.endsWith(".json") && file !== "pack.json")
  .flatMap((file) => {
    const raw: unknown = JSON.parse(readFileSync(join(packDir, file), "utf8"));
    return parsePackObjects(raw, join(packDir, file));
  });

const world = finalizeWorld({ objects, map: townMap });
createGameState({ seed: 1, world });
console.log(
  `pack "${manifest.id}" OK: ${String(maps.length)} map(s), ${String(objects.length)} object(s), links resolve, world boots`,
);
```

(`createGameState` doubles as the spawn-conflict check: two NPCs scheduled onto the
same tile at 08:00 fail validation, not gameplay.)

- [ ] **Step 8: Verify everything**

```bash
pnpm validate:content && pnpm test
```

Expected: `pack "base" OK: 1 map(s), 14 object(s), links resolve, world boots` and all tests pass.

Append to `packages/content/src/index.ts`:

```ts
export { loadBaseWorld } from "./base.ts";
```

- [ ] **Step 9: Full gate and commit**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
git add -A && git commit -m "Ship base pack social content: town rework, NPCs, dialogue"
```

## Task 15: Client — NPCs on screen, DOM dialogue/reputation/clock UI

The client stays rule-free: it renders `GameState`, forwards input as intents, and
lets `advance()` decide everything (rejections come back as `intent-rejected` events
and surface as a toast).

**Files:**

- Modify: `packages/client/index.html`, `packages/client/src/world-scene.ts`
- Create: `packages/client/src/ui.ts`

- [ ] **Step 1: Replace `packages/client/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pirata</title>
    <style>
      :root {
        color-scheme: dark;
        --panel: #1b2129;
        --border: #3a4453;
        --ink: #e8e0c9;
        --accent: #d9a441;
      }
      html,
      body {
        margin: 0;
        min-height: 100%;
        background: #101418;
        color: var(--ink);
        font-family: system-ui, sans-serif;
      }
      #app {
        display: grid;
        gap: 8px;
        padding: 8px;
        justify-content: center;
      }
      #hud {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        font-size: 14px;
      }
      #hint {
        color: #8a93a3;
      }
      #stage {
        display: grid;
        grid-template-columns: auto 200px;
        gap: 8px;
        align-items: start;
      }
      #reputation {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 10px;
        font-size: 13px;
      }
      #reputation h2 {
        margin: 0 0 6px;
        font-size: 13px;
        color: var(--accent);
      }
      #reputation ul {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 4px;
      }
      #dialogue {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 12px 14px;
        max-width: 640px;
      }
      #dialogue h2 {
        margin: 0 0 4px;
        font-size: 14px;
        color: var(--accent);
      }
      #dialogue p {
        margin: 0 0 8px;
      }
      #dialogue ol {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 4px;
        counter-reset: choice;
      }
      #dialogue button {
        width: 100%;
        text-align: left;
        background: #232b36;
        color: var(--ink);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 6px 10px;
        font: inherit;
        cursor: pointer;
      }
      #dialogue button::before {
        counter-increment: choice;
        content: counter(choice) ". ";
        color: var(--accent);
      }
      #dialogue button:hover,
      #dialogue button:focus-visible {
        border-color: var(--accent);
      }
      #toast {
        position: fixed;
        inset-inline: 0;
        bottom: 12px;
        margin: auto;
        width: fit-content;
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 6px 12px;
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <div id="app">
      <header id="hud">
        <span id="clock" data-testid="clock"></span>
        <span id="hint">Arrows/WASD move · E talk · Space wait · 1-5 choose</span>
      </header>
      <div id="stage">
        <main id="game" aria-label="Pirata game canvas"></main>
        <aside id="reputation" aria-label="Reputation">
          <h2>Reputation</h2>
          <ul id="reputation-list"></ul>
        </aside>
      </div>
      <section id="dialogue" role="dialog" aria-label="Conversation" hidden>
        <h2 id="dialogue-name"></h2>
        <p id="dialogue-text" data-testid="dialogue-text"></p>
        <ol id="dialogue-choices"></ol>
      </section>
    </div>
    <div id="toast" role="status" hidden></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Write `packages/client/src/ui.ts`**

```ts
import {
  clockOf,
  currentNode,
  factionStanding,
  npcStanding,
  visibleChoices,
  type GameState,
  type WorldDef,
} from "@pirata/core";

function element<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (found === null) {
    throw new Error(`missing UI element ${selector} (index.html out of sync)`);
  }
  return found;
}

export function renderClock(state: GameState): void {
  const clock = clockOf(state.tick);
  const hour = String(clock.hour).padStart(2, "0");
  const minute = String(clock.minute).padStart(2, "0");
  element<HTMLElement>("#clock").textContent = `Day ${String(clock.day)} — ${hour}:${minute}`;
}

export function renderReputation(state: GameState, world: WorldDef): void {
  const rows: HTMLElement[] = [];
  for (const faction of Object.values(world.factions)) {
    rows.push(reputationRow(faction.id, faction.name, factionStanding(state, world, faction.id)));
  }
  for (const npc of Object.values(world.npcs)) {
    rows.push(reputationRow(npc.id, npc.name, npcStanding(state, world, npc.id)));
  }
  element<HTMLElement>("#reputation-list").replaceChildren(...rows);
}

function reputationRow(id: string, name: string, standing: number): HTMLElement {
  const row = document.createElement("li");
  row.setAttribute("data-testid", id);
  row.textContent = `${name}: ${standing >= 0 ? "+" : ""}${String(standing)}`;
  return row;
}

export function renderDialogue(
  state: GameState,
  world: WorldDef,
  onChoose: (index: number) => void,
): void {
  const panel = element<HTMLElement>("#dialogue");
  const npc = state.dialogue === null ? undefined : world.npcs[state.dialogue.npcId];
  const node = currentNode(state, world);
  if (npc === undefined || node === undefined) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  element<HTMLElement>("#dialogue-name").textContent = npc.name;
  element<HTMLElement>("#dialogue-text").textContent = node.text;
  element<HTMLElement>("#dialogue-choices").replaceChildren(
    ...visibleChoices(state, world).map((choice, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = choice.text;
      button.addEventListener("click", () => {
        onChoose(index);
      });
      item.append(button);
      return item;
    }),
  );
}

let toastTimer: number | undefined;

export function showToast(message: string): void {
  const toast = element<HTMLElement>("#toast");
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 1600);
}
```

- [ ] **Step 3: Rewrite `packages/client/src/world-scene.ts`**

```ts
import { loadBaseWorld } from "@pirata/content";
import townJson from "@pirata/content/packs/base/maps/port_town.map.json";
import {
  advance,
  createGameState,
  deserialize,
  SaveError,
  serialize,
  type DeedRecordedEvent,
  type Direction,
  type GameEvent,
  type GameState,
  type Intent,
  type WorldDef,
} from "@pirata/core";
import { GameObjects, Input, Scene } from "phaser";
import { renderClock, renderDialogue, renderReputation, showToast } from "./ui.ts";

const TILE = 32;
const MOVE_COOLDOWN_MS = 140;
const SAVE_KEY = "pirata-save";
const TILE_COLORS = [0x8a795d, 0x4d4338, 0x1d3f6e];
const FACTION_COLORS: Readonly<Record<string, number>> = {
  "base:merchants_guild": 0x7fb069,
  "base:dockworkers": 0x5b8dbe,
};
const CHOICE_KEYS = ["ONE", "TWO", "THREE", "FOUR", "FIVE"] as const;

export class WorldScene extends Scene {
  private world!: WorldDef;
  private state!: GameState;
  private playerSprite!: GameObjects.Rectangle;
  private npcSprites = new Map<string, GameObjects.Container>();
  private polledKeys!: ReadonlyArray<readonly [Intent, Input.Keyboard.Key]>;
  private lastMoveAt = 0;

  constructor() {
    super("world");
  }

  preload(): void {
    this.load.tilemapTiledJSON("port_town", townJson as unknown as object);
  }

  create(): void {
    this.world = loadBaseWorld();
    this.state = this.loadOrCreateState();

    this.createPlaceholderTileset();
    const tilemap = this.make.tilemap({ key: "port_town" });
    const tileset = tilemap.addTilesetImage("placeholder", "placeholder");
    if (tileset === null) {
      throw new Error("failed to attach placeholder tileset to tilemap");
    }
    tilemap.createLayer("ground", tileset);
    tilemap.createLayer("walls", tileset);

    const { x, y } = this.state.player.pos;
    this.playerSprite = this.add.rectangle(
      x * TILE + TILE / 2,
      y * TILE + TILE / 2,
      TILE - 8,
      TILE - 4,
      0xd9a441,
    );
    this.createNpcSprites();

    this.setUpKeys();
    this.setUpPersistence();
    this.exposeDebugHook();
    this.renderUi();
  }

  override update(time: number): void {
    if (this.state.dialogue !== null) {
      return;
    }
    if (time - this.lastMoveAt < MOVE_COOLDOWN_MS) {
      return;
    }
    for (const [intent, key] of this.polledKeys) {
      if (key.isDown) {
        this.apply(intent);
        this.lastMoveAt = time;
        return;
      }
    }
  }

  private apply(intent: Intent): void {
    const result = advance(this.state, intent, this.world);
    this.state = result.state;
    for (const event of result.events) {
      this.renderEvent(event);
    }
    this.renderUi();
  }

  private renderEvent(event: GameEvent): void {
    switch (event.type) {
      case "player-moved":
        this.tweens.add({
          targets: this.playerSprite,
          x: event.to.x * TILE + TILE / 2,
          y: event.to.y * TILE + TILE / 2,
          duration: 110,
        });
        break;
      case "npc-moved": {
        const sprite = this.npcSprites.get(event.npcId);
        if (sprite !== undefined) {
          this.tweens.add({
            targets: sprite,
            x: event.to.x * TILE + TILE / 2,
            y: event.to.y * TILE + TILE / 2,
            duration: 110,
          });
        }
        break;
      }
      case "deed-recorded":
        this.floatDeedText(event);
        break;
      case "intent-rejected":
        showToast(event.reason);
        break;
      case "movement-blocked":
      case "dialogue-started":
      case "dialogue-advanced":
      case "dialogue-ended":
      case "reputation-changed":
        break; // reflected by renderUi()
    }
  }

  private renderUi(): void {
    renderClock(this.state);
    renderReputation(this.state, this.world);
    renderDialogue(this.state, this.world, (index) => {
      this.apply({ type: "choose", index });
    });
  }

  private floatDeedText(event: DeedRecordedEvent): void {
    const deed = this.world.deeds[event.deedId];
    const npc = this.world.npcs[event.npcId];
    if (deed === undefined || npc === undefined) {
      return;
    }
    const gain = deed.standingDelta >= 0;
    const label = this.add
      .text(
        this.playerSprite.x,
        this.playerSprite.y - 20,
        `${gain ? "+" : ""}${String(deed.standingDelta)} ${npc.name}`,
        { fontSize: "12px", color: gain ? "#9fdf7f" : "#e07a5f" },
      )
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

  private createNpcSprites(): void {
    for (const npc of this.state.npcs) {
      const def = this.world.npcs[npc.id];
      if (def === undefined) {
        continue;
      }
      const body = this.add.rectangle(
        0,
        0,
        TILE - 10,
        TILE - 6,
        FACTION_COLORS[def.factionId] ?? 0xcccccc,
      );
      const label = this.add
        .text(0, -TILE / 2, def.name, { fontSize: "10px", color: "#e8e0c9" })
        .setOrigin(0.5, 1);
      const container = this.add.container(
        npc.pos.x * TILE + TILE / 2,
        npc.pos.y * TILE + TILE / 2,
        [body, label],
      );
      this.npcSprites.set(npc.id, container);
    }
  }

  private loadOrCreateState(): GameState {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved !== null) {
      try {
        return deserialize(saved);
      } catch (error) {
        if (error instanceof SaveError) {
          console.warn(`ignoring saved game: ${error.message}`);
        } else {
          throw error;
        }
      }
    }
    return createGameState({ seed: Date.now() >>> 0, world: this.world });
  }

  private setUpKeys(): void {
    const keyboard = this.input.keyboard;
    if (keyboard === null) {
      throw new Error("keyboard input is unavailable");
    }
    const move = (direction: Direction): Intent => ({ type: "move", direction });
    this.polledKeys = [
      [move("north"), keyboard.addKey(Input.Keyboard.KeyCodes.UP)],
      [move("north"), keyboard.addKey(Input.Keyboard.KeyCodes.W)],
      [move("south"), keyboard.addKey(Input.Keyboard.KeyCodes.DOWN)],
      [move("south"), keyboard.addKey(Input.Keyboard.KeyCodes.S)],
      [move("west"), keyboard.addKey(Input.Keyboard.KeyCodes.LEFT)],
      [move("west"), keyboard.addKey(Input.Keyboard.KeyCodes.A)],
      [move("east"), keyboard.addKey(Input.Keyboard.KeyCodes.RIGHT)],
      [move("east"), keyboard.addKey(Input.Keyboard.KeyCodes.D)],
      [{ type: "wait" }, keyboard.addKey(Input.Keyboard.KeyCodes.SPACE)],
    ];
    keyboard.on("keydown-E", () => {
      this.apply({ type: "talk" });
    });
    CHOICE_KEYS.forEach((name, index) => {
      keyboard.on(`keydown-${name}`, () => {
        if (this.state.dialogue !== null) {
          this.apply({ type: "choose", index });
        }
      });
    });
  }

  private setUpPersistence(): void {
    window.addEventListener("beforeunload", () => {
      localStorage.setItem(SAVE_KEY, serialize(this.state));
    });
  }

  private exposeDebugHook(): void {
    // eslint-disable-next-line no-underscore-dangle -- __pirata is the documented Window debug-hook name (global.d.ts)
    window.__pirata = {
      getState: () => this.state,
      dispatch: (intent) => {
        this.apply(intent);
      },
    };
  }
}
```

- [ ] **Step 4: Build and eyeball**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm --filter @pirata/client build
```

Expected: all green, client builds. Optionally `pnpm dev` and check: four named NPCs
stand at tavern/market/docks, E next to Duarte opens the dialogue, choices resolve,
reputation panel and clock update, Space passes time.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Render NPCs and social UI: dialogue, reputation, clock"
```

## Task 16: e2e — the social loop in a real browser

**Files:**

- Create: `e2e/social.spec.ts`

- [ ] **Step 1: Write `e2e/social.spec.ts`**

```ts
/* eslint-disable no-underscore-dangle -- __pirata is the documented Window debug-hook name (e2e/types.d.ts) */
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__pirata !== undefined);
});

test("NPCs stand at their scheduled morning posts", async ({ page }) => {
  const npcs = await page.evaluate(() => window.__pirata?.getState().npcs);
  expect(npcs).toContainEqual({ id: "base:tavernkeeper", pos: { x: 3, y: 3 } });
  expect(npcs).toContainEqual({ id: "base:merchant", pos: { x: 9, y: 3 } });
  expect(npcs).toContainEqual({ id: "base:harbormaster", pos: { x: 17, y: 10 } });
  expect(npcs).toContainEqual({ id: "base:stevedore", pos: { x: 17, y: 11 } });
});

test("talking to the harbormaster runs a dialogue and moves reputation", async ({ page }) => {
  await page.evaluate(() => {
    for (let i = 0; i < 4; i += 1) {
      window.__pirata?.dispatch({ type: "move", direction: "south" });
    }
    window.__pirata?.dispatch({ type: "talk" });
  });
  await expect(page.getByTestId("dialogue-text")).toContainText("State your business");
  await page.getByRole("button", { name: "Lend a hand with the cargo." }).click();
  await expect(page.getByTestId("dialogue-text")).toContainText("grunts");
  const deeds = await page.evaluate(() => window.__pirata?.getState().deeds);
  expect(deeds).toEqual([{ deedId: "base:lent_a_hand", npcId: "base:harbormaster", tick: 4 }]);
  await expect(page.getByTestId("base:dockworkers")).toContainText("+10");
  await page.getByRole("button", { name: "Anytime." }).click();
  const dialogue = await page.evaluate(() => window.__pirata?.getState().dialogue);
  expect(dialogue).toBeNull();
});

test("time passes and NPCs follow their schedules", async ({ page }) => {
  await page.evaluate(() => {
    for (let i = 0; i < 110; i += 1) {
      window.__pirata?.dispatch({ type: "wait" });
    }
  });
  await expect(page.getByTestId("clock")).toContainText("19:00");
  const merchant = await page.evaluate(
    () => window.__pirata?.getState().npcs.find((npc) => npc.id === "base:merchant")?.pos,
  );
  expect(merchant).not.toEqual({ x: 9, y: 3 });
});
```

(The player spawns at (17,5); four south moves reach (17,9), adjacent to Duarte at
dock_north (17,10). All NPCs are stationary at 08:00, so the walk is deterministic.
Tick 110 is 19:00, when Beatriz leaves the market for the tavern.)

- [ ] **Step 2: Run the e2e suite**

```bash
pnpm test:e2e
```

Expected: 5 passed (2 existing smoke tests + 3 social tests). If the smoke tests
fail, something regressed in the M1 loop — fix that, don't adjust the smoke tests.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "Add Playwright coverage for schedules, dialogue, reputation"
```

## Task 17: ADR, docs sync, ship

**Files:**

- Create: `docs/adr/0002-social-simulation-data-model.md`
- Modify: `CLAUDE.md`, `docs/superpowers/plans/2026-07-06-m2-social-world.md` (this file)

- [ ] **Step 1: Write the ADR** — `docs/adr/0002-social-simulation-data-model.md`

```markdown
# ADR 0002: Social simulation data model

**Status:** Accepted · **Date:** 2026-07-06 · **Milestone:** M2

## Context

M2 adds NPCs with schedules, data-driven dialogue, and reputation that visibly
reacts to the player (spec §4.3). The systems must be deterministic, serializable,
and entirely content-driven, and they must leave room for M3's crime/gossip loop
without building it now.

## Decisions

1. **Reputation is a deed ledger, not a number.** `GameState.deeds` records
   `{deedId, npcId, tick}`; standings are computed on demand. Deed _meanings_
   (standing deltas) live in content packs.
2. **M2 knowledge rule: witnesses tell their faction instantly.** Faction standing
   sums deeds witnessed by members. M3 replaces this single rule with gossip
   propagation over in-game time (a `knownBy` set per deed) — the ledger shape
   already supports that.
3. **Dialogue is a tree of nodes with condition-gated choices.** The condition
   vocabulary is tiny (npc/faction standing thresholds, always relative to the
   interlocutor) and grows by content demand; effects record deeds. The link pass
   requires one unconditioned choice per node, so the player can never be stranded.
4. **Schedules are hour→location lists.** NPCs take one deterministic BFS step per
   tick toward the current target; an occupied next step means waiting a tick.
   Locations are named walkable points in the Tiled map's `locations` object layer.
5. **Dialogue takes no game time.** Talking and choosing don't tick the clock, so
   conversation partners never walk away mid-sentence; time passes only on move/wait.
6. **Save version bumped to 2.** State grew; old saves are rejected with a clear
   error and the client starts fresh.

## Consequences

- Faction reactions are instant in M2, which slightly overstates how fast word
  spreads; accepted as a placeholder the M3 gossip system replaces.
- BFS ignores entities, so an NPC standing on another's destination causes polite
  hovering, not rerouting — cheap, deterministic, and reads as social behavior.
- The dialogue condition vocabulary is deliberately minimal; new condition types
  are code contributions to core, not content hacks.
```

- [ ] **Step 2: Sync `CLAUDE.md`**

Two edits:

1. Replace the stale push rule (the project owner granted a standing exception on
   2026-07-05) — change the final bullet's ending from "Never push (YubiKey) — the
   user pushes. Never commit to `main`; feature branches + PRs." to:
   "Push feature branches and open PRs (no YubiKey needed for this repo — standing
   exception). Never push or commit to `main`."
2. Add one gotcha bullet:
   "Content JSON is imported with `with { type: \"json\" }` attributes so the same
   modules load under Node, Vite, and vitest; content ships as data files in
   `packages/content/packs/base/` validated by `pnpm validate:content` (schema +
   link pass + spawn smoke)."

- [ ] **Step 3: Sync this plan**

Re-read the plan checkboxes against what actually happened; where execution deviated,
edit the relevant task in place (this file is the record M3 builds on). Tick all
completed checkboxes.

- [ ] **Step 4: Full verification**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
pnpm validate:content && pnpm check:attribution
pnpm test:e2e
actionlint .github/workflows/ && zizmor .github/workflows/
```

Expected: everything green. No workflow changes were made, so the last line is a
regression guard only.

- [ ] **Step 5: Commit, push, open a draft PR**

```bash
git add -A && git commit -m "Add ADR-0002 and sync docs for the M2 social world"
git push -u origin feat/m2-social-world
gh pr create --draft --title "M2: A social world" --body "..."
```

PR body: what the milestone delivers (scheduled NPCs, data-driven dialogue, deed
ledger reputation, social UI), the save-version bump and its designed fallback, and
a pointer to ADR-0002 and this plan. Plain, factual language.

---

## Self-review notes (spec coverage)

- **M2 roadmap line** — "NPCs with schedules" (Tasks 5, 9, 14), "data-driven
  dialogue" (Tasks 8, 10, 12–14), "per-NPC/faction reputation ledger visibly
  reacting" (Tasks 7, 10, 14–16). ✓
- **Spec §4.1** — intents/events extended, determinism property retained (Task 10);
  state fully serializable (Task 6). ✓
- **Spec §4.3 NPCs** — schedules yes; needs/fears/utility AI is _not_ in the M2
  roadmap line and is deliberately deferred. Dialogue conditions/effects hook into
  reputation as specified; rumor/crime hooks arrive with M3/M4.
- **Spec §4.4** — namespaced ids, strict Zod validation with file/field errors,
  link pass (finalization) failing on dangling refs. Pack dependency/override
  semantics remain unimplemented until a second pack exists (YAGNI). ✓
- **Spec §5** — scenario harness delivered (Task 11); property tests extended;
  content validated in CI via the existing `validate:content` step; e2e boots and
  plays the loop. ✓
- **Not in scope, on purpose:** gossip propagation timing (M3), crimes/witnesses
  (M3), rumors (M4), typed id wrappers, pack overrides, touch input.
