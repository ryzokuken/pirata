import { createGameState } from "@pirata/core";
import { describe, expect, it } from "vitest";
import { loadBaseWorld } from "./base.ts";

describe("base pack", () => {
  it("loads, links, and boots a fresh game", () => {
    const world = loadBaseWorld();
    expect(Object.keys(world.npcs)).toHaveLength(5);
    expect(Object.keys(world.factions)).toHaveLength(3);
    const state = createGameState({ seed: 1, world });
    expect(state.npcs).toContainEqual({
      id: "base:tavernkeeper",
      pos: { x: 3, y: 3 },
      pockets: ["base:rum_bottle"],
    });
    expect(state.npcs).toContainEqual({
      id: "base:merchant",
      pos: { x: 12, y: 3 },
      pockets: ["base:silver_ring"],
    });
    expect(state.npcs).toContainEqual({
      id: "base:harbormaster",
      pos: { x: 32, y: 17 },
      pockets: ["base:tobacco_pouch"],
    });
    expect(state.npcs).toContainEqual({
      id: "base:stevedore",
      pos: { x: 31, y: 20 },
      pockets: ["base:dried_fish"],
    });
  });

  it("ships the watch, wares, and laws", () => {
    const world = loadBaseWorld();
    expect(world.factions["base:town_watch"]).toBeDefined();
    expect(world.npcs["base:watchwoman"]?.confront).toEqual({
      standingBelow: -10,
      dialogueId: "base:watch_confront",
    });
    expect(world.crimes).toEqual({ pickpocket: "base:pickpocketing", theft: "base:theft" });
    expect(world.npcs["base:merchant"]?.shop?.sells).toContain("base:rum_bottle");
    expect(world.maps[world.startMapId]?.items.length).toBeGreaterThanOrEqual(3);
  });
});
