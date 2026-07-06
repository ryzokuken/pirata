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
