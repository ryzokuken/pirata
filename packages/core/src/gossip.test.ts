import { describe, expect, it } from "vitest";
import { spreadGossip } from "./gossip.ts";
import type { DeedRecord, NpcState } from "./state.ts";
import { fixtureWorld } from "./world.fixture.ts";

const world = fixtureWorld();

function npc(id: string, x: number, y: number): NpcState {
  return { id, mapId: "town", pos: { x, y }, pockets: [] };
}

const theft: DeedRecord = { deedId: "test:theft", tick: 1, knownBy: ["test:keeper"] };

describe("spreadGossip", () => {
  it("shares knowledge between NPCs in conversation range", () => {
    const npcs = [npc("test:keeper", 4, 4), npc("test:walker", 4, 3)];
    const result = spreadGossip({ deeds: [theft], npcs, map: world.maps[world.startMapId]! });
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
    const result = spreadGossip({ deeds: [theft], npcs, map: world.maps[world.startMapId]! });
    expect(result.deeds[0]?.knownBy).toEqual(["test:keeper"]);
    expect(result.events).toEqual([]);
  });

  it("does nothing when everyone already knows", () => {
    const both: DeedRecord = { ...theft, knownBy: ["test:keeper", "test:walker"] };
    const npcs = [npc("test:keeper", 4, 4), npc("test:walker", 4, 3)];
    const result = spreadGossip({ deeds: [both], npcs, map: world.maps[world.startMapId]! });
    expect(result.deeds).toEqual([both]);
    expect(result.events).toEqual([]);
  });

  it("chains within a single tick along a crowd", () => {
    // a knows; b within range of a; c within range of b but not a.
    const npcs = [npc("test:keeper", 1, 3), npc("test:walker", 3, 3), npc("test:guard", 5, 3)];
    const result = spreadGossip({ deeds: [theft], npcs, map: world.maps[world.startMapId]! });
    expect(result.deeds[0]?.knownBy).toEqual(["test:guard", "test:keeper", "test:walker"]);
  });
});
