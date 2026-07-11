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
    expect(() => finalizeWorld({ objects: broken, map: sealedMap })).toThrow(
      /map "town": location "cellar" at \(1,2\) is unreachable from the player spawn \(blocked off by walls\?\)/,
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
    expect(() => finalizeWorld({ objects: brokenObjects, map: brokenMap })).toThrow(
      /map "town": item "t:coin" at \(2,2\) is unreachable from the player spawn \(blocked off by walls\?\)/,
    );
  });

  it("does not reject an unreferenced sealed location", () => {
    expect(() => finalizeWorld({ objects: objects(), map: sealedMap })).not.toThrow();
  });
});
