import packJson from "@pirata/content/packs/base/pack.json" with { type: "json" };
import { ContentError, parsePackManifest } from "./loader.ts";
import type { PackAssets } from "./schemas.ts";

/** The base pack's declared art, validated through the ordinary manifest schema. */
export function loadBaseAssets(): PackAssets {
  const manifest = parsePackManifest(packJson, "packs/base/pack.json");
  if (manifest.assets === undefined) {
    throw new ContentError("packs/base/pack.json: base pack must declare an assets section");
  }
  return manifest.assets;
}
