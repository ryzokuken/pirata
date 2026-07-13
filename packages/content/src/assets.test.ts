import { describe, expect, it } from "vitest";
import { loadBaseAssets } from "./assets.ts";

describe("loadBaseAssets", () => {
  it("returns the base tileset and a sheet for the player and every npc sprite", () => {
    const assets = loadBaseAssets();
    expect(assets.tileset.image).toBe("assets/tileset.png");
    expect(Object.keys(assets.characters)).toHaveLength(8);
    expect(assets.characters["player"]).toBeDefined();
  });
});
