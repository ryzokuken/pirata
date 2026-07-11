import { createGameState } from "@pirata/core";
import { describe, expect, it } from "vitest";
import { loadBaseWorld } from "./base.ts";

describe("base pack", () => {
  it("loads, links, and boots a fresh game", () => {
    const world = loadBaseWorld();
    expect(Object.keys(world.npcs)).toHaveLength(7);
    expect(Object.keys(world.factions)).toHaveLength(4);
    const state = createGameState({ seed: 1, world });
    expect(state.npcs).toContainEqual({
      id: "base:tavernkeeper",
      mapId: "port_town",
      pos: { x: 3, y: 3 },
      pockets: ["base:rum_bottle"],
    });
    expect(state.npcs).toContainEqual({
      id: "base:merchant",
      mapId: "port_town",
      pos: { x: 12, y: 3 },
      pockets: ["base:silver_ring"],
    });
    expect(state.npcs).toContainEqual({
      id: "base:harbormaster",
      mapId: "port_town",
      pos: { x: 32, y: 17 },
      pockets: ["base:tobacco_pouch"],
    });
    expect(state.npcs).toContainEqual({
      id: "base:stevedore",
      mapId: "port_town",
      pos: { x: 31, y: 20 },
      pockets: ["base:dried_fish"],
    });
    expect(state.npcs).toContainEqual({
      id: "base:smuggler_lookout",
      mapId: "smugglers_cove",
      pos: { x: 16, y: 9 },
      pockets: ["base:rum_bottle"],
      hp: 8,
    });
    expect(state.npcs).toContainEqual({
      id: "base:smuggler_quartermaster",
      mapId: "smugglers_cove",
      pos: { x: 17, y: 3 },
      pockets: ["base:silver_ring"],
      hp: 10,
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

  it("ships the smugglers' cove: hostile faction, rumor, and treasure", () => {
    const world = loadBaseWorld();
    expect(Object.keys(world.maps)).toEqual(
      expect.arrayContaining(["port_town", "smugglers_cove"]),
    );
    expect(world.factions["base:smugglers"]).toBeDefined();
    expect(world.npcs["base:smuggler_lookout"]).toMatchObject({
      mapId: "smugglers_cove",
      hostile: true,
      combat: {
        maxHp: 8,
        attackBonus: 3,
        armorClass: 12,
        damage: { count: 1, sides: 6, bonus: 0 },
      },
    });
    expect(world.npcs["base:smuggler_quartermaster"]).toMatchObject({
      mapId: "smugglers_cove",
      hostile: true,
      combat: {
        maxHp: 10,
        attackBonus: 4,
        armorClass: 13,
        damage: { count: 1, sides: 8, bonus: 1 },
      },
    });
    expect(world.rumors["base:cove_cache"]).toBeDefined();
    expect(world.items["base:pearl_strand"]?.treasure).toBe(true);
    expect(world.items["base:dried_fish"]?.food).toEqual({ nutrition: 8 });
    expect(world.items["base:rum_bottle"]?.food).toEqual({ nutrition: 2 });
  });
});
