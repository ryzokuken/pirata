import { describe, expect, it } from "vitest";
import type { NpcDef } from "./defs.ts";
import { advanceNpcs, scheduleTarget } from "./npc.ts";
import { createGameState } from "./state.ts";
import { fixtureWorld } from "./world.fixture.ts";

function npcWithSchedule(schedule: NpcDef["schedule"]): NpcDef {
  return {
    id: "test:npc",
    name: "Npc",
    factionId: "test:guild",
    dialogueId: "test:talk",
    mapId: "fixture",
    schedule,
    pockets: [],
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
    expect(result.npcs).toContainEqual({
      id: "test:walker",
      mapId: "town",
      pos: { x: 6, y: 2 },
      pockets: [],
    });
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
    expect(result.npcs).toContainEqual({
      id: "test:walker",
      mapId: "town",
      pos: { x: 6, y: 1 },
      pockets: [],
    });
    expect(result.events).toEqual([]);
  });

  it("arrives at the new post within the hour", () => {
    const state = createGameState({ seed: 1, world });
    let npcs = state.npcs;
    for (let tick = 10; tick < 20; tick += 1) {
      npcs = advanceNpcs({ npcs, playerPos: state.player.pos, world, tick }).npcs;
    }
    expect(npcs).toContainEqual({
      id: "test:walker",
      mapId: "town",
      pos: { x: 1, y: 3 },
      pockets: [],
    });
    expect(npcs).toContainEqual({
      id: "test:keeper",
      mapId: "town",
      pos: { x: 4, y: 4 },
      pockets: ["test:pearl"],
    });
  });
});
