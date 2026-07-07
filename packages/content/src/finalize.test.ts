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
