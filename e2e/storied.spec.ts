/* eslint-disable no-underscore-dangle -- __pirata is the documented Window debug-hook name (e2e/types.d.ts) */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DIRECTION_DELTAS,
  type Direction,
  type GameState,
  type Intent,
  type Vec2,
} from "@pirata/core";
import { expect, test, type Page } from "@playwright/test";

// Route discipline: every coordinate below is read from the ACTUAL generated
// map JSON (packages/content/packs/base/maps/*.map.json, produced by
// scripts/build-maps.ts) rather than transcribed from the ASCII layouts by
// hand. Walking routes are computed by a plain terrain BFS (walls only, no
// game rules) over that same data, so a map edit that changes geometry
// breaks this file loudly instead of silently walking into a wall.

const mapsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../packages/content/packs/base/maps",
);

interface TiledLayer {
  readonly name: string;
  readonly data?: readonly number[];
}

interface TiledMap {
  readonly width: number;
  readonly height: number;
  readonly layers: readonly TiledLayer[];
}

interface WallGrid {
  readonly width: number;
  readonly height: number;
  readonly blocked: ReadonlySet<string>;
}

function key(pos: Vec2): string {
  return `${String(pos.x)},${String(pos.y)}`;
}

function loadWalls(fileName: string): WallGrid {
  const map = JSON.parse(readFileSync(join(mapsDir, fileName), "utf8")) as TiledMap;
  const wallLayer = map.layers.find((layer) => layer.name === "walls");
  if (wallLayer?.data === undefined) {
    throw new Error(`${fileName}: no "walls" tile layer found`);
  }
  const blocked = new Set<string>();
  wallLayer.data.forEach((gid, index) => {
    if (gid !== 0) {
      blocked.add(key({ x: index % map.width, y: Math.floor(index / map.width) }));
    }
  });
  return { width: map.width, height: map.height, blocked };
}

// Loaded once at module scope: the same JSON the client ships.
const TOWN_WALLS = loadWalls("port_town.map.json");
const COVE_WALLS = loadWalls("smugglers_cove.map.json");

/** Shortest walking route between two tiles, ignoring NPCs (terrain only). */
function bfsPath(
  grid: WallGrid,
  start: Vec2,
  end: Vec2,
  avoid: ReadonlySet<string> = new Set(),
): readonly Direction[] {
  const visited = new Set<string>([key(start)]);
  const cameFrom = new Map<string, { readonly from: string; readonly dir: Direction }>();
  const queue: Vec2[] = [start];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }
    if (current.x === end.x && current.y === end.y) {
      const path: Direction[] = [];
      let node = key(current);
      for (let step = cameFrom.get(node); step !== undefined; step = cameFrom.get(node)) {
        path.push(step.dir);
        node = step.from;
      }
      return path.toReversed();
    }
    for (const [dir, delta] of Object.entries(DIRECTION_DELTAS) as [
      Direction,
      { dx: number; dy: number },
    ][]) {
      const next = { x: current.x + delta.dx, y: current.y + delta.dy };
      const nextKey = key(next);
      if (next.x < 0 || next.y < 0 || next.x >= grid.width || next.y >= grid.height) {
        continue;
      }
      if (grid.blocked.has(nextKey) || avoid.has(nextKey) || visited.has(nextKey)) {
        continue;
      }
      visited.add(nextKey);
      cameFrom.set(nextKey, { from: key(current), dir });
      queue.push(next);
    }
  }
  throw new Error(`no walking route from ${key(start)} to ${key(end)}`);
}

/** A free (unblocked, unoccupied) tile next to `target`, for approaching an NPC. */
function freeNeighbor(grid: WallGrid, target: Vec2, occupied: ReadonlySet<string>): Vec2 {
  for (const delta of Object.values(DIRECTION_DELTAS)) {
    const candidate = { x: target.x + delta.dx, y: target.y + delta.dy };
    const candidateKey = key(candidate);
    if (!grid.blocked.has(candidateKey) && !occupied.has(candidateKey)) {
      return candidate;
    }
  }
  throw new Error(`no free tile next to ${key(target)}`);
}

async function dispatch(page: Page, intent: Intent): Promise<void> {
  await page.evaluate((sent) => window.__pirata?.dispatch(sent), intent);
}

async function walk(page: Page, directions: readonly Direction[]): Promise<void> {
  await page.evaluate((dirs) => {
    for (const direction of dirs) {
      window.__pirata?.dispatch({ type: "move", direction });
    }
  }, directions);
}

async function waitTicks(page: Page, ticks: number): Promise<void> {
  await page.evaluate((count) => {
    for (let i = 0; i < count; i += 1) {
      window.__pirata?.dispatch({ type: "wait" });
    }
  }, ticks);
}

async function getState(page: Page): Promise<GameState> {
  const state = await page.evaluate(() => window.__pirata?.getState());
  if (state === undefined) {
    throw new Error("window.__pirata is not initialized");
  }
  return state;
}

/**
 * Walks up to a tile next to `npcId`, re-reading its live position and
 * retrying every attempt — a scheduled NPC keeps walking toward its own
 * post while we're mid-route, so a route computed from one snapshot of its
 * position can go stale before we arrive. Converges once the NPC settles.
 *
 * Some posts (e.g. the watch's tavern_door beat) sit in a doorway that is
 * the only way in or out of a room — while occupied, the room behind it is
 * briefly unreachable. Rather than assume a fixed schedule, treat "no free
 * neighbor" or "no route" as transient: wait a few ticks and try again.
 */
async function approachNpc(page: Page, grid: WallGrid, npcId: string): Promise<void> {
  const maxAttempts = 30;
  const retryWaitTicks = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const state = await getState(page);
    const npc = state.npcs.find((candidate) => candidate.id === npcId);
    if (npc === undefined) {
      throw new Error(`${npcId} is missing from state.npcs`);
    }
    const occupied = new Set(
      state.npcs
        .filter((candidate) => candidate.mapId === state.mapId)
        .map((candidate) => key(candidate.pos)),
    );
    try {
      const target = freeNeighbor(grid, npc.pos, occupied);
      if (target.x === state.player.pos.x && target.y === state.player.pos.y) {
        return;
      }
      await walk(page, bfsPath(grid, state.player.pos, target, occupied));
    } catch {
      await waitTicks(page, retryWaitTicks);
    }
  }
  throw new Error(`could not catch up to ${npcId} within ${String(maxAttempts)} attempts`);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__pirata !== undefined);
});

test("hearing a rumor, robbing the cove blind, and fencing the loot completes the v0 loop", async ({
  page,
}) => {
  // Leg 1: spawn (30,17) to the tile just east of the tavernkeeper's nook
  // (tavern_bar, 3,3) — (4,3) is open floor, adjacent to her. The naive
  // shortest route runs along row 7 through the watchwoman's watch_post
  // (21,7); avoid that tile so we don't bump her mid-walk.
  await walk(page, bfsPath(TOWN_WALLS, { x: 30, y: 17 }, { x: 4, y: 3 }, new Set(["21,7"])));

  await dispatch(page, { type: "talk" });
  await expect(page.getByTestId("dialogue-text")).toContainText("What'll it be");
  const before = await getState(page);

  // "What's the word on the coast? (10 coin)" — the paid extraction path
  // (base:tavernkeeper_talk's "hello"/greeting node, dialogues.json).
  await page.getByRole("button", { name: /What's the word on the coast/ }).click();
  await expect(page.getByTestId("dialogue-text")).toContainText("Brethren cache their haul");
  await page.getByRole("button", { name: "Much obliged." }).click();

  const afterRumor = await getState(page);
  expect(afterRumor.player.coin).toBe(before.player.coin - 10);
  expect(afterRumor.rumors).toContain("base:cove_cache");
  await expect(page.locator("#journal-list")).toContainText("Brethren cache their haul");

  // Leg 2: the tavernkeeper's nook (4,3) to the north-road portal (27,1).
  // Walking there alone (40 ticks total, including leg 1) already carries
  // the clock past 12:00 (08:00 start, 10 ticks/hour) — Old Tano's schedule
  // moves him from cove_cellar to cove_mouth at noon, so by the time we
  // reach the chamber his post beside the pearl stands unwatched.
  await walk(page, bfsPath(TOWN_WALLS, { x: 4, y: 3 }, { x: 27, y: 1 }));
  expect((await getState(page)).mapId).toBe("smugglers_cove");

  // Leg 3: the arrival beach (14,15) to the pearl (16,3). Tano's post at
  // cove_mouth (14,9) sees a Chebyshev radius of 5 by day, so the whole
  // column-14 corridor from row 4 (chamber threshold) down through row 14
  // (just short of the beach) is inside his sightline — avoid that entire
  // shaft and go in the professional's way instead, up the west tide
  // tunnel (column 2), which the link pass guarantees connects beach to
  // chamber and which is always >5 tiles from the mouth (dx alone is 12).
  const mouthCorridor = new Set(Array.from({ length: 11 }, (_unused, i) => `14,${String(i + 4)}`));
  const toPearl = bfsPath(COVE_WALLS, { x: 14, y: 15 }, { x: 16, y: 3 }, mouthCorridor);
  await walk(page, toPearl);
  await dispatch(page, { type: "take" });

  const afterTake = await getState(page);
  expect(afterTake.player.items).toContain("base:pearl_strand");
  const theft = afterTake.deeds.find((deed) => deed.deedId === "base:theft");
  expect(theft?.knownBy).toEqual([]); // the clean crime — nobody saw it

  // Leg 4: back down the tunnel to the beach, then the return portal
  // (15,15, one step east of cove_beach) to the town's north_road (26,1).
  await walk(page, bfsPath(COVE_WALLS, { x: 16, y: 3 }, { x: 14, y: 15 }, mouthCorridor));
  await walk(page, bfsPath(COVE_WALLS, { x: 14, y: 15 }, { x: 15, y: 15 }));
  const backInTown = await getState(page);
  expect(backInTown.mapId).toBe("port_town");
  expect(backInTown.player.pos).toEqual({ x: 26, y: 1 });

  // Leg 5: fence the pearl with the merchant, wherever her schedule has put
  // her by now (hour is well past noon; she may already be back home at
  // tavern_corner rather than at the market stall).
  await approachNpc(page, TOWN_WALLS, "base:merchant");
  await dispatch(page, { type: "trade" });
  await expect(page.locator("#trade")).toBeVisible();

  const beforeSell = await getState(page);
  await page.getByRole("button", { name: /Sell Strand of pearls/ }).click();

  const afterSell = await getState(page);
  expect(afterSell.player.coin).toBeGreaterThan(beforeSell.player.coin);
  expect(afterSell.flags.fortuneMade).toBe(true);
});

test("walking into the cove by day draws steel", async ({ page }) => {
  // Spawn (30,17) to the north-road portal (27,1), a much shorter walk than
  // the tavern detour above (19 ticks) — arrives well before noon, while
  // Old Tano still guards the cellar but Vico patrols the mouth ground
  // (cove_west/cove_east, row 9) all day regardless of the hour.
  await walk(page, bfsPath(TOWN_WALLS, { x: 30, y: 17 }, { x: 27, y: 1 }));
  expect((await getState(page)).mapId).toBe("smugglers_cove");

  // Walk north from the beach (14,15) into the open mouth ground one tick
  // at a time until a patrol notices and steel is drawn.
  let combatStarted = false;
  for (let step = 0; step < 15; step += 1) {
    await dispatch(page, { type: "move", direction: "north" });
    combatStarted = (await getState(page)).combat !== null;
    if (combatStarted) {
      break;
    }
  }
  expect(combatStarted).toBe(true);

  // Flee south, back toward the beach, until the fight ends.
  let fled = false;
  for (let step = 0; step < 10; step += 1) {
    await dispatch(page, { type: "flee", direction: "south" });
    fled = (await getState(page)).combat === null;
    if (fled) {
      break;
    }
  }
  expect(fled).toBe(true);

  // Walk clear back to the beach row, then out the return portal —
  // leaving the map clears the alert even though the smuggler is still
  // hunting on it (Task 8: alert clears when the player leaves the map).
  for (let step = 0; step < 10; step += 1) {
    if ((await getState(page)).player.pos.y >= 15) {
      break;
    }
    await dispatch(page, { type: "move", direction: "south" });
  }
  await dispatch(page, { type: "move", direction: "east" }); // (14,15) -> portal (15,15)

  const back = await getState(page);
  expect(back.mapId).toBe("port_town");
  const lookout = back.npcs.find((npc) => npc.id === "base:smuggler_lookout");
  expect(lookout?.alert).not.toBe(true);
});

test("hunger climbs with time and resets with food", async ({ page }) => {
  // 08:00 -> 20:00 is 12 hours = 120 ticks at 10 ticks/hour; hunger accrues
  // +1 per 10 ticks, landing exactly on HUNGRY_AT (12).
  await waitTicks(page, 120);
  await expect(page.getByTestId("hunger")).toContainText("Hungry");

  // By 20:00 the merchant is on her way to (or already at) her evening post,
  // tavern_corner — chase her down wherever she currently stands. Catching
  // her may itself cost extra waiting (e.g. the watch briefly camping a
  // doorway), so buy a few dried fish rather than exactly one: enough
  // nutrition (8 each) to cover however much hunger accrued in the meantime.
  await approachNpc(page, TOWN_WALLS, "base:merchant");
  await dispatch(page, { type: "trade" });
  for (let fish = 0; fish < 4; fish += 1) {
    await page.getByRole("button", { name: /Buy Dried fish/ }).click();
  }
  await dispatch(page, { type: "close-trade" });

  for (let bite = 0; bite < 4; bite += 1) {
    if ((await page.getByTestId("hunger").textContent()) === "Fed") {
      break;
    }
    const current = await getState(page);
    const fishIndex = current.player.items.indexOf("base:dried_fish");
    expect(fishIndex).toBeGreaterThanOrEqual(0);
    await dispatch(page, { type: "eat", index: fishIndex });
  }

  await expect(page.getByTestId("hunger")).toContainText("Fed");
});
