import { describe, expect, it } from "vitest";
import { resolvePackAssetUrl } from "./assets.ts";

describe("resolvePackAssetUrl", () => {
  const bundled = {
    "../../content/packs/base/assets/tileset.png": "/bundled/tileset-abc123.png",
  };

  it("maps a pack-relative path to its bundled url", () => {
    expect(resolvePackAssetUrl(bundled, "assets/tileset.png")).toBe("/bundled/tileset-abc123.png");
  });

  it("throws a clear error for assets missing from the bundle", () => {
    expect(() => resolvePackAssetUrl(bundled, "assets/nope.png")).toThrow(/assets\/nope\.png/);
  });
});
