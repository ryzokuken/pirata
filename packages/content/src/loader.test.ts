import { describe, expect, it } from "vitest";
import { ContentError, parsePackManifest, parsePackObjects } from "./loader.ts";

const valid = {
  id: "base",
  name: "Pirata Base Game",
  version: "0.1.0",
  license: "CC-BY-SA-4.0",
  authors: ["Pirata contributors"],
};

describe("parsePackManifest", () => {
  it("parses a valid manifest and defaults dependencies to []", () => {
    const manifest = parsePackManifest(valid, "packs/base/pack.json");
    expect(manifest.id).toBe("base");
    expect(manifest.dependencies).toEqual([]);
  });

  it("names the source file and the missing field in errors", () => {
    const { name: _dropped, ...missingName } = valid;
    expect(() => parsePackManifest(missingName, "packs/broken/pack.json")).toThrow(ContentError);
    expect(() => parsePackManifest(missingName, "packs/broken/pack.json")).toThrow(
      /packs\/broken\/pack\.json[\s\S]*name/,
    );
  });

  it("rejects unknown fields (strict schema)", () => {
    expect(() => parsePackManifest({ ...valid, sneaky: true }, "p.json")).toThrow(/sneaky/);
  });

  it("rejects a pack id that is not lowercase snake_case", () => {
    expect(() => parsePackManifest({ ...valid, id: "Bad-Id" }, "p.json")).toThrow(/snake_case/);
  });
});

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

describe("rumor object", () => {
  it("parses a rumor", () => {
    const objects = parsePackObjects(
      [{ type: "rumor", id: "base:cove_whisper", text: "There's a cove north of town." }],
      "rumors.json",
    );
    expect(objects[0]).toMatchObject({ type: "rumor", text: "There's a cove north of town." });
  });

  it("rejects a rumor with empty text", () => {
    expect(() =>
      parsePackObjects([{ type: "rumor", id: "base:empty", text: "" }], "rumors.json"),
    ).toThrow(ContentError);
  });
});

describe("npc map, hostile, and combat fields", () => {
  it("parses an npc's map, hostile flag, and combat stats", () => {
    const objects = parsePackObjects(
      [
        {
          type: "npc",
          id: "base:smuggler",
          name: "Smuggler",
          faction: "base:merchants_guild",
          dialogue: "base:smuggler_talk",
          map: "smugglers_cove",
          schedule: [{ hour: 0, location: "mouth" }],
          hostile: true,
          combat: {
            maxHp: 6,
            attackBonus: 2,
            armorClass: 10,
            damage: { count: 1, sides: 4, bonus: 0 },
          },
        },
      ],
      "npcs.json",
    );
    expect(objects[0]).toMatchObject({ map: "smugglers_cove", hostile: true });
  });

  it("rejects an npc map that is not lowercase snake_case", () => {
    expect(() =>
      parsePackObjects(
        [
          {
            type: "npc",
            id: "base:smuggler",
            name: "Smuggler",
            faction: "base:merchants_guild",
            dialogue: "base:smuggler_talk",
            map: "Smugglers-Cove",
            schedule: [{ hour: 0, location: "mouth" }],
          },
        ],
        "npcs.json",
      ),
    ).toThrow(/snake_case/);
  });

  it("rejects combat stats with a non-positive armor class", () => {
    expect(() =>
      parsePackObjects(
        [
          {
            type: "npc",
            id: "base:smuggler",
            name: "Smuggler",
            faction: "base:merchants_guild",
            dialogue: "base:smuggler_talk",
            schedule: [{ hour: 0, location: "mouth" }],
            hostile: true,
            combat: {
              maxHp: 6,
              attackBonus: 2,
              armorClass: 0,
              damage: { count: 1, sides: 4, bonus: 0 },
            },
          },
        ],
        "npcs.json",
      ),
    ).toThrow(ContentError);
  });
});

describe("item food and treasure fields", () => {
  it("parses food and treasure flags", () => {
    const objects = parsePackObjects(
      [
        {
          type: "item",
          id: "base:dried_fish",
          name: "Dried fish",
          value: 3,
          food: { nutrition: 8 },
        },
        {
          type: "item",
          id: "base:pearl_strand",
          name: "Pearl strand",
          value: 50,
          treasure: true,
        },
      ],
      "items.json",
    );
    expect(objects[0]).toMatchObject({ food: { nutrition: 8 } });
    expect(objects[1]).toMatchObject({ treasure: true });
  });

  it("rejects zero nutrition", () => {
    expect(() =>
      parsePackObjects(
        [{ type: "item", id: "base:water", name: "Water", value: 1, food: { nutrition: 0 } }],
        "items.json",
      ),
    ).toThrow(ContentError);
  });
});

describe("rumor dialogue effect", () => {
  it("parses a rumor effect", () => {
    const objects = parsePackObjects(
      [
        {
          type: "dialogue",
          id: "base:tavernkeeper_talk",
          start: "hello",
          nodes: {
            hello: {
              text: "What'll it be?",
              choices: [
                { text: "Any whispers?", effects: [{ type: "rumor", rumor: "base:cove_whisper" }] },
                { text: "Nothing." },
              ],
            },
          },
        },
      ],
      "dialogues.json",
    );
    expect(objects[0]?.type).toBe("dialogue");
  });

  it("rejects a rumor effect naming an object id instead of a rumor field", () => {
    expect(() =>
      parsePackObjects(
        [
          {
            type: "dialogue",
            id: "base:tavernkeeper_talk",
            start: "hello",
            nodes: {
              hello: {
                text: "What'll it be?",
                choices: [{ text: "Any whispers?", effects: [{ type: "rumor" }] }],
              },
            },
          },
        ],
        "dialogues.json",
      ),
    ).toThrow(ContentError);
  });
});
