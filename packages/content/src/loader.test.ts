import { describe, expect, it } from "vitest";
import { ContentError, parsePackManifest } from "./loader.ts";

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
