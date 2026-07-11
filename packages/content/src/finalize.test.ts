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
  items: [],
  portals: [],
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
      pockets: [],
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

function finalize(objs: readonly PackObject[], maps: readonly MapModel[] = [map]): unknown {
  return finalizeWorld({ objects: objs, maps, startMapId: maps[0]?.id ?? "town" });
}

describe("finalizeWorld", () => {
  it("builds a WorldDef with resolved references", () => {
    const world = finalizeWorld({ objects: objects(), maps: [map], startMapId: "town" });
    expect(world.npcs["base:merchant"]?.factionId).toBe("base:guild");
    expect(world.npcs["base:merchant"]?.dialogueId).toBe("base:merchant_talk");
    expect(world.npcs["base:merchant"]?.mapId).toBe("town");
    expect(world.dialogues["base:merchant_talk"]?.nodes["greeting"]?.choices[0]?.effects).toEqual([
      { type: "deed", deedId: "base:insult" },
    ]);
  });

  it("rejects duplicate ids", () => {
    const dupes = [...objects(), { type: "faction", id: "base:guild", name: "Again" } as const];
    expect(() => finalize(dupes)).toThrow(/duplicate.*base:guild/);
  });

  it("rejects an unknown faction reference", () => {
    const broken = objects().map((object) =>
      object.type === "npc" ? { ...object, faction: "base:ghosts" } : object,
    );
    expect(() => finalize(broken)).toThrow(/base:ghosts/);
  });

  it("rejects an unknown dialogue reference", () => {
    const broken = objects().map((object) =>
      object.type === "npc" ? { ...object, dialogue: "base:silence" } : object,
    );
    expect(() => finalize(broken)).toThrow(/base:silence/);
  });

  it("rejects an unknown deed in an effect", () => {
    const broken = objects().filter((object) => object.type !== "deed");
    expect(() => finalize(broken)).toThrow(/base:insult/);
  });

  it("rejects a missing start node", () => {
    const broken = objects().map((object) =>
      object.type === "dialogue" ? { ...object, start: "nowhere" } : object,
    );
    expect(() => finalize(broken)).toThrow(/nowhere/);
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
    expect(() => finalize(broken)).toThrow(/missing/);
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
    expect(() => finalize(broken)).toThrow(/unconditioned/);
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
    expect(() => finalize(broken)).toThrow(/strictly increasing/);
  });

  it("rejects a schedule location missing from the map", () => {
    const broken = objects().map((object) =>
      object.type === "npc" ? { ...object, schedule: [{ hour: 8, location: "moon" }] } : object,
    );
    expect(() => finalize(broken)).toThrow(/moon/);
  });

  it("wraps every failure in ContentError", () => {
    expect(() => finalize([])).not.toThrow();
    const dupes = [...objects(), { type: "faction", id: "base:guild", name: "Again" } as const];
    expect(() => finalize(dupes)).toThrow(ContentError);
  });
});

describe("finalize items and crimes", () => {
  it("indexes items and crime verb mappings", () => {
    const world = finalize([
      ...objects(),
      { type: "item", id: "t:coin", name: "Coin", value: 1 },
      { type: "deed", id: "t:deed", name: "Theft", standingDelta: -5 },
      { type: "crime", id: "t:law", verb: "theft", deed: "t:deed" },
    ]) as ReturnType<typeof finalizeWorld>;
    expect(world.items["t:coin"]?.value).toBe(1);
    expect(world.crimes.theft).toBe("t:deed");
  });

  it("rejects two crimes for one verb", () => {
    expect(() =>
      finalize([
        ...objects(),
        { type: "crime", id: "t:law", verb: "theft", deed: "t:deed" },
        { type: "crime", id: "t:law2", verb: "theft", deed: "t:deed" },
      ]),
    ).toThrow(/duplicate crime for verb "theft"/);
  });

  it("rejects a crime pointing at a missing deed", () => {
    const broken = [
      ...objects(),
      { type: "crime" as const, id: "t:law", verb: "theft" as const, deed: "t:ghost" },
    ];
    expect(() => finalize(broken)).toThrow(/unknown deed "t:ghost"/);
  });

  it("rejects pocket items that do not exist", () => {
    const broken = objects().map((object) =>
      object.type === "npc" ? { ...object, pockets: ["t:ghost"] } : object,
    );
    expect(() => finalize(broken)).toThrow(
      /npc "base:merchant": unknown item "t:ghost" in pockets/,
    );
  });

  it("rejects shop wares that do not exist", () => {
    const broken = objects().map((object) =>
      object.type === "npc" ? { ...object, shop: { sells: ["t:ghost"] } } : object,
    );
    expect(() => finalize(broken)).toThrow(/npc "base:merchant": unknown item "t:ghost" in shop/);
  });

  it("rejects a confront dialogue that does not exist", () => {
    const broken = objects().map((object) =>
      object.type === "npc"
        ? { ...object, confront: { standingBelow: -10, dialogue: "base:ghost_talk" } }
        : object,
    );
    expect(() => finalize(broken)).toThrow(
      /npc "base:merchant": unknown dialogue "base:ghost_talk" in confront/,
    );
  });

  it("rejects a map item that no pack defines", () => {
    const brokenMap: MapModel = {
      ...map,
      items: [{ itemId: "t:ghost", pos: { x: 0, y: 0 } }],
    };
    expect(() => finalize(objects(), [brokenMap])).toThrow(
      /map "town": unknown item "t:ghost" placed at \(0,0\)/,
    );
  });
});

describe("finalize hostile/combat, rumors, and unknown maps", () => {
  it("rejects an npc with an unknown map", () => {
    const broken = objects().map((object) =>
      object.type === "npc" ? { ...object, map: "moonbase" } : object,
    );
    expect(() => finalize(broken)).toThrow(/npc "base:merchant": unknown map "moonbase"/);
  });

  it("defaults an npc's map to the start map", () => {
    const world = finalize(objects()) as ReturnType<typeof finalizeWorld>;
    expect(world.npcs["base:merchant"]?.mapId).toBe("town");
  });

  it("rejects hostile without combat stats", () => {
    const broken = objects().map((object) =>
      object.type === "npc" ? { ...object, hostile: true } : object,
    );
    expect(() => finalize(broken)).toThrow(/npc "base:merchant": hostile without combat stats/);
  });

  it("accepts hostile with combat stats", () => {
    const combatCapable = objects().map((object) =>
      object.type === "npc"
        ? {
            ...object,
            hostile: true,
            combat: {
              maxHp: 6,
              attackBonus: 2,
              armorClass: 10,
              damage: { count: 1, sides: 4, bonus: 0 },
            },
          }
        : object,
    );
    const world = finalize(combatCapable) as ReturnType<typeof finalizeWorld>;
    expect(world.npcs["base:merchant"]?.hostile).toBe(true);
    expect(world.npcs["base:merchant"]?.combat?.maxHp).toBe(6);
  });

  it("resolves a rumor effect and indexes the rumor def", () => {
    const withRumor = objects().map((object) => {
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
          greeting: {
            ...greeting,
            choices: [
              ...greeting.choices,
              { text: "Whispers?", effects: [{ type: "rumor" as const, rumor: "t:whisper" }] },
            ],
          },
        },
      };
    });
    const world = finalize([
      ...withRumor,
      { type: "rumor", id: "t:whisper", text: "A rumor." },
    ]) as ReturnType<typeof finalizeWorld>;
    expect(world.rumors["t:whisper"]).toEqual({ id: "t:whisper", text: "A rumor." });
  });

  it("rejects a rumor effect pointing at an unknown rumor", () => {
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
          greeting: {
            ...greeting,
            choices: [
              { text: "Whispers?", effects: [{ type: "rumor" as const, rumor: "t:ghost" }] },
            ],
          },
        },
      };
    });
    expect(() => finalize(broken)).toThrow(/references unknown rumor "t:ghost"/);
  });
});

describe("finalize reachability", () => {
  // width 5, height 3: spawn at (0,0), an open row 0, and a sealed room at
  // row 2 walled off from row 0 by a solid wall row 1 (no door).
  const sealedMap: MapModel = {
    id: "town",
    width: 5,
    height: 3,
    blocked: [
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ],
    playerSpawn: { x: 0, y: 0 },
    locations: { market: { x: 1, y: 0 }, cellar: { x: 1, y: 2 } },
    items: [],
    portals: [],
  };

  it("rejects a scheduled location on an unreachable tile", () => {
    const broken = objects().map((object) =>
      object.type === "npc" ? { ...object, schedule: [{ hour: 8, location: "cellar" }] } : object,
    );
    expect(() => finalize(broken, [sealedMap])).toThrow(
      /map "town": location "cellar" at \(1,2\) is unreachable from the map's entry points \(blocked off by walls\?\)/,
    );
  });

  it("rejects a placed item on an unreachable tile", () => {
    const brokenMap: MapModel = {
      ...sealedMap,
      items: [{ itemId: "t:coin", pos: { x: 2, y: 2 } }],
    };
    const brokenObjects = [
      ...objects(),
      { type: "item" as const, id: "t:coin", name: "Coin", value: 1 },
    ];
    expect(() => finalize(brokenObjects, [brokenMap])).toThrow(
      /map "town": item "t:coin" at \(2,2\) is unreachable from the map's entry points \(blocked off by walls\?\)/,
    );
  });

  it("does not reject an unreferenced sealed location", () => {
    expect(() => finalize(objects(), [sealedMap])).not.toThrow();
  });
});

describe("finalize multi-map, portals, and per-map reachability", () => {
  const lair: MapModel = {
    id: "lair",
    width: 3,
    height: 1,
    blocked: [false, false, false],
    playerSpawn: { x: 0, y: 0 },
    locations: { post: { x: 2, y: 0 } },
    items: [],
    portals: [{ at: { x: 0, y: 0 }, toMapId: "town", toLocation: "market" }],
  };
  const townWithPortal: MapModel = {
    ...map,
    portals: [{ at: { x: 1, y: 0 }, toMapId: "lair", toLocation: "post" }],
  };

  function multiMapObjects(): PackObject[] {
    return [
      ...objects(),
      {
        type: "npc",
        id: "base:brute",
        name: "Brute",
        faction: "base:guild",
        dialogue: "base:merchant_talk",
        map: "lair",
        schedule: [{ hour: 0, location: "post" }],
        pockets: [],
        hostile: true,
        combat: {
          maxHp: 6,
          attackBonus: 2,
          armorClass: 10,
          damage: { count: 1, sides: 4, bonus: 0 },
        },
      },
    ];
  }

  it("builds a WorldDef spanning multiple maps with npcs on their own map", () => {
    const world = finalizeWorld({
      objects: multiMapObjects(),
      maps: [townWithPortal, lair],
      startMapId: "town",
    });
    expect(world.npcs["base:brute"]?.mapId).toBe("lair");
    expect(Object.keys(world.maps)).toEqual(["town", "lair"]);
  });

  it("rejects a duplicate map id", () => {
    expect(() =>
      finalizeWorld({
        objects: objects(),
        maps: [townWithPortal, { ...lair, id: "town" }],
        startMapId: "town",
      }),
    ).toThrow(/duplicate map id "town"/);
  });

  it("rejects an unknown start map", () => {
    expect(() => finalizeWorld({ objects: objects(), maps: [map], startMapId: "nowhere" })).toThrow(
      /unknown start map "nowhere"/,
    );
  });

  it("rejects a portal to an unknown map", () => {
    const brokenTown: MapModel = {
      ...map,
      portals: [{ at: { x: 1, y: 0 }, toMapId: "atlantis", toLocation: "post" }],
    };
    expect(() =>
      finalizeWorld({ objects: objects(), maps: [brokenTown], startMapId: "town" }),
    ).toThrow(/map "town": portal to unknown map "atlantis"/);
  });

  it("rejects a portal to an unknown location on a known map", () => {
    const brokenTown: MapModel = {
      ...map,
      portals: [{ at: { x: 1, y: 0 }, toMapId: "lair", toLocation: "nowhere" }],
    };
    expect(() =>
      finalizeWorld({ objects: objects(), maps: [brokenTown, lair], startMapId: "town" }),
    ).toThrow(/map "town": portal to unknown location "nowhere" on map "lair"/);
  });

  it("treats a portal-arrival location as a reachability entry point on the target map", () => {
    // The lair's own spawn (0,0) is walled off from "post" in this fixture
    // variant, but "post" is still legal because the town portal lands there.
    // (No return portal here, or its unreachable tile would trip a separate check.)
    const isolatedLair: MapModel = {
      ...lair,
      blocked: [false, true, false],
      portals: [],
    };
    expect(() =>
      finalizeWorld({
        objects: multiMapObjects(),
        maps: [townWithPortal, isolatedLair],
        startMapId: "town",
      }),
    ).not.toThrow();
  });

  it("rejects a non-start map with no entry points reaching a scheduled location", () => {
    const disconnectedLair: MapModel = { ...lair, portals: [] };
    const disconnectedTown: MapModel = { ...map, portals: [] };
    expect(() =>
      finalizeWorld({
        objects: multiMapObjects(),
        maps: [disconnectedTown, disconnectedLair],
        startMapId: "town",
      }),
    ).toThrow(/map "lair": location "post" at \(2,0\) is unreachable/);
  });

  it("rejects an unreachable portal tile", () => {
    const unreachablePortalTown: MapModel = {
      ...map,
      width: 5,
      height: 3,
      blocked: [
        false,
        false,
        false,
        false,
        false,
        true,
        true,
        true,
        true,
        true,
        false,
        false,
        false,
        false,
        false,
      ],
      locations: { market: { x: 1, y: 0 } },
      portals: [{ at: { x: 1, y: 2 }, toMapId: "lair", toLocation: "post" }],
    };
    expect(() =>
      finalizeWorld({
        objects: objects(),
        maps: [unreachablePortalTown, lair],
        startMapId: "town",
      }),
    ).toThrow(/map "town": portal "lair\/post" at \(1,2\) is unreachable/);
  });
});
