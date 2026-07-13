import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { blit, createPng, detectRamp, readPngFile, recolorRamp, writePngFile } from "./lib/png.ts";

const REPO_URL =
  "https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator";
const REPO_SHA = "72624ebc8c758c6e439aea90ef9a68eb7366a992";
const REPO_DIR = ".cache/lpc-generator";
const OUT_DIR = "packages/content/packs/base/assets/characters";
const SHEET_W = 576;
const SHEET_H = 256;

type PaletteName = "cloth" | "hair" | "body";

interface Layer {
  /** Path under spritesheets/, without the trailing walk.png. */
  readonly path: string;
  readonly recolor?: { readonly palette: PaletteName; readonly to: string };
}

interface Recipe {
  readonly id: string;
  /** Body-palette ramp applied to body and head layers ("" keeps the default skin). */
  readonly skin: string;
  readonly layers: readonly Layer[];
}

// Paint order: body, head, feet, legs, torso, overlay (apron/armour), hair, hat.
const RECIPES: readonly Recipe[] = [
  {
    id: "player",
    skin: "",
    layers: [
      { path: "body/bodies/male" },
      { path: "head/heads/human/male" },
      { path: "feet/boots/basic/male" },
      { path: "legs/pants/male", recolor: { palette: "cloth", to: "brown" } },
      {
        path: "torso/clothes/sleeveless/sleeveless1/male",
        recolor: { palette: "cloth", to: "red" },
      },
      { path: "hair/curly_short/adult" },
      { path: "hat/cloth/bandana/adult", recolor: { palette: "cloth", to: "navy" } },
    ],
  },
  {
    id: "tavernkeeper",
    skin: "amber",
    layers: [
      { path: "body/bodies/female" },
      { path: "head/heads/human/female" },
      { path: "feet/shoes/basic/thin" },
      { path: "legs/skirts/plain/thin", recolor: { palette: "cloth", to: "maroon" } },
      {
        path: "torso/clothes/longsleeve/longsleeve/female",
        recolor: { palette: "cloth", to: "forest" },
      },
      { path: "torso/aprons/overalls/female" },
      { path: "hair/long/adult", recolor: { palette: "hair", to: "black" } },
    ],
  },
  {
    id: "merchant",
    skin: "bronze",
    layers: [
      { path: "body/bodies/female" },
      { path: "head/heads/human/female" },
      { path: "feet/shoes/basic/thin" },
      { path: "legs/skirts/plain/thin", recolor: { palette: "cloth", to: "charcoal" } },
      {
        path: "torso/clothes/longsleeve/longsleeve/female",
        recolor: { palette: "cloth", to: "purple" },
      },
      { path: "hair/bob/adult", recolor: { palette: "hair", to: "chestnut" } },
    ],
  },
  {
    id: "harbormaster",
    skin: "brown",
    layers: [
      { path: "body/bodies/male" },
      { path: "head/heads/human/male" },
      { path: "feet/boots/basic/male" },
      { path: "legs/pants/male", recolor: { palette: "cloth", to: "charcoal" } },
      {
        path: "torso/clothes/longsleeve/longsleeve2_buttoned/male",
        recolor: { palette: "cloth", to: "navy" },
      },
      { path: "hair/balding/adult", recolor: { palette: "hair", to: "gray" } },
      { path: "hat/cloth/leather_cap/adult" },
    ],
  },
  {
    id: "stevedore",
    skin: "bronze",
    layers: [
      { path: "body/bodies/male" },
      { path: "head/heads/human/male" },
      { path: "feet/shoes/basic/male" },
      { path: "legs/pants/male", recolor: { palette: "cloth", to: "walnut" } },
      {
        path: "torso/clothes/sleeveless/sleeveless2/male",
        recolor: { palette: "cloth", to: "tan" },
      },
      { path: "hat/cloth/bandana2/adult", recolor: { palette: "cloth", to: "red" } },
    ],
  },
  {
    id: "watchwoman",
    skin: "",
    layers: [
      { path: "body/bodies/female" },
      { path: "head/heads/human/female" },
      { path: "feet/boots/basic/thin" },
      { path: "legs/pants/thin", recolor: { palette: "cloth", to: "charcoal" } },
      {
        path: "torso/clothes/shortsleeve/shortsleeve/female",
        recolor: { palette: "cloth", to: "sky" },
      },
      { path: "torso/armour/leather/female" },
      { path: "hair/curly_long/adult", recolor: { palette: "hair", to: "raven" } },
    ],
  },
  {
    id: "smuggler_lookout",
    skin: "",
    layers: [
      { path: "body/bodies/male" },
      { path: "head/heads/human/male" },
      { path: "feet/shoes/basic/male" },
      { path: "legs/pants/male", recolor: { palette: "cloth", to: "slate" } },
      {
        path: "torso/clothes/sleeveless/sleeveless2/male",
        recolor: { palette: "cloth", to: "black" },
      },
      { path: "hat/cloth/bandana/adult", recolor: { palette: "cloth", to: "charcoal" } },
    ],
  },
  {
    id: "smuggler_quartermaster",
    skin: "amber",
    layers: [
      { path: "body/bodies/male" },
      { path: "head/heads/human/male" },
      { path: "feet/boots/basic/male" },
      { path: "legs/pants/male", recolor: { palette: "cloth", to: "black" } },
      {
        path: "torso/clothes/longsleeve/longsleeve2/male",
        recolor: { palette: "cloth", to: "leather" },
      },
      { path: "hair/long_messy/adult", recolor: { palette: "hair", to: "gray" } },
    ],
  },
];

function ensureRepo(): void {
  if (!existsSync(REPO_DIR)) {
    mkdirSync(".cache", { recursive: true });
    execFileSync(
      "git",
      ["clone", "--depth", "1", "--filter=blob:none", "--sparse", REPO_URL, REPO_DIR],
      { stdio: "inherit" },
    );
    // Only the layer categories the recipes use — all of spritesheets/ is ~1.4GB.
    execFileSync(
      "git",
      [
        "-C",
        REPO_DIR,
        "sparse-checkout",
        "set",
        "spritesheets/body",
        "spritesheets/head",
        "spritesheets/feet",
        "spritesheets/legs",
        "spritesheets/torso",
        "spritesheets/hair",
        "spritesheets/hat",
        "sheet_definitions",
        "palette_definitions",
      ],
      { stdio: "inherit" },
    );
  }
  const head = execFileSync("git", ["-C", REPO_DIR, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  if (head !== REPO_SHA) {
    execFileSync("git", ["-C", REPO_DIR, "fetch", "--depth", "1", "origin", REPO_SHA], {
      stdio: "inherit",
    });
    execFileSync("git", ["-C", REPO_DIR, "checkout", REPO_SHA], { stdio: "inherit" });
  }
}

function loadPalette(name: PaletteName): Record<string, string[]> {
  const file = join(REPO_DIR, "palette_definitions", name, `${name}_ulpc.json`);
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, string[]>;
}

interface SheetCredit {
  readonly file: string;
  readonly notes?: string;
  readonly authors: readonly string[];
  readonly licenses: readonly string[];
  readonly urls: readonly string[];
}

/** Map layer path prefixes (e.g. "legs/pants/male") to their sheet_definitions credits. */
function indexCredits(): Map<string, readonly SheetCredit[]> {
  const index = new Map<string, readonly SheetCredit[]>();
  const walk = (dir: string): void => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, item.name);
      if (item.isDirectory()) {
        walk(path);
      } else if (item.name.endsWith(".json")) {
        const def = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
        const credits = def["credits"] as readonly SheetCredit[] | undefined;
        if (credits === undefined) {
          continue;
        }
        for (const credit of credits) {
          index.set(credit.file.replace(/\/$/, ""), credits);
        }
      }
    }
  };
  walk(join(REPO_DIR, "sheet_definitions"));
  return index;
}

function creditsFor(
  index: Map<string, readonly SheetCredit[]>,
  layerPath: string,
): readonly SheetCredit[] {
  let path = layerPath;
  while (path.includes("/")) {
    const found = index.get(path);
    if (found !== undefined) {
      return found;
    }
    path = path.slice(0, path.lastIndexOf("/"));
  }
  throw new Error(`no sheet_definitions credits found for layer "${layerPath}"`);
}

ensureRepo();
mkdirSync(OUT_DIR, { recursive: true });
const palettes = {
  cloth: loadPalette("cloth"),
  hair: loadPalette("hair"),
  body: loadPalette("body"),
};
const creditsIndex = indexCredits();

for (const recipe of RECIPES) {
  const sheet = createPng(SHEET_W, SHEET_H);
  const usedCredits: SheetCredit[] = [];
  for (const layer of recipe.layers) {
    const png = readPngFile(join(REPO_DIR, "spritesheets", layer.path, "walk.png"));
    if (png.width !== SHEET_W || png.height !== SHEET_H) {
      throw new Error(
        `${layer.path}: expected ${String(SHEET_W)}x${String(SHEET_H)}, got ${String(png.width)}x${String(png.height)}`,
      );
    }
    const isSkinLayer = layer.path.startsWith("body/") || layer.path.startsWith("head/");
    const recolor =
      layer.recolor ??
      (isSkinLayer && recipe.skin !== ""
        ? { palette: "body" as const, to: recipe.skin }
        : undefined);
    if (recolor !== undefined) {
      const palette = palettes[recolor.palette];
      const source = detectRamp(png, palette);
      if (source === undefined) {
        throw new Error(
          `${layer.path}: could not detect source ramp in ${recolor.palette} palette`,
        );
      }
      const from = palette[source];
      const to = palette[recolor.to];
      if (from === undefined || to === undefined) {
        throw new Error(
          `${layer.path}: ramp "${recolor.to}" not in ${recolor.palette} palette (${Object.keys(palette).join(", ")})`,
        );
      }
      recolorRamp(png, from, to);
    }
    blit(sheet, png);
    for (const credit of creditsFor(creditsIndex, layer.path)) {
      if (!usedCredits.some((existing) => existing.file === credit.file)) {
        usedCredits.push(credit);
      }
    }
  }
  writePngFile(`${OUT_DIR}/${recipe.id}.png`, sheet);
  const creditsText = usedCredits
    .map((credit) =>
      [
        `## ${credit.file}`,
        `Authors: ${credit.authors.join(", ")}`,
        `Licenses: ${credit.licenses.join(", ")}`,
        `URLs: ${credit.urls.join(" ")}`,
        credit.notes === undefined ? "" : `Notes: ${credit.notes}`,
      ]
        .filter((line) => line !== "")
        .join("\n"),
    )
    .join("\n\n");
  writeFileSync(
    `${OUT_DIR}/${recipe.id}.CREDITS.txt`,
    `Composited by scripts/compose-characters.ts from Universal LPC generator layers\n(${REPO_URL} @ ${REPO_SHA}).\nWalk animation only, 576x256, 9x4 frames of 64px.\n\n${creditsText}\n`,
  );
  console.log(`wrote ${OUT_DIR}/${recipe.id}.png + credits`);
}
