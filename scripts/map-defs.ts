import { gid, TILE, TILES, TILESET_COLUMNS } from "./tileset-manifest.ts";

interface Vec2 {
  readonly x: number;
  readonly y: number;
}

interface PortalTarget {
  readonly toMapId: string;
  readonly toLocation: string;
}

export type Theme = "coast" | "cave";

export interface MapSpec {
  readonly id: string;
  readonly theme: Theme;
  readonly layout: readonly string[];
  readonly locationLegend: Readonly<Record<string, string>>;
  readonly itemLegend: Readonly<Record<string, string>>;
  readonly portalLegend: Readonly<Record<string, PortalTarget>>;
  readonly groundOverlay?: readonly string[];
  readonly decorOverlay?: readonly string[];
}

const TOWN_LAYOUT: readonly string[] = [
  "####################################",
  "#.........................RO.~~~~~~#",
  "#.#######..######............~~~~~~#",
  "#.#B.H..#..#M.1.#............~~~~~~#",
  "#.#C....#..#....#............~~~~~~#",
  "#.#T....#..##.###............~~~~~~#",
  "#.##.####....................~~~~~~#",
  "#....................W.......~~~~~~#",
  "#............................~~~~~~#",
  "#.######......######.........~~~~~~#",
  "#.#....#......#....#.........~~~~~~#",
  "#.#....#......#....#.........~~~~~~#",
  "#.#....#......#....#.........~~~~~~#",
  "#.###.##......###.##.........~~~~~~#",
  "#............................~~~~~~#",
  "#............................~~~~~~#",
  "#.....########...............~~~~~~#",
  "#.....#..23..#................P.N~~#",
  "#.....#......#...............~~~~~~#",
  "#.....#......#..........D....~~~~~~#",
  "#.....###.####.................S~~~#",
  "#............................~~~~~~#",
  "#............................~~~~~~#",
  "####################################",
];

const TOWN_LOCATION_LEGEND: Readonly<Record<string, string>> = {
  B: "tavern_bar",
  H: "tavern_hearth",
  C: "tavern_corner",
  M: "market",
  N: "dock_north",
  S: "dock_south",
  T: "tavern_bench",
  W: "watch_post",
  D: "dock_watch",
  R: "north_road",
};

const TOWN_ITEM_LEGEND: Readonly<Record<string, string>> = {
  "1": "base:silk_bolt",
  "2": "base:rum_bottle",
  "3": "base:dried_fish",
};

const TOWN_PORTAL_LEGEND: Readonly<Record<string, PortalTarget>> = {
  O: { toMapId: "smugglers_cove", toLocation: "cove_beach" },
};

const TOWN_GROUND_OVERLAY: readonly string[] = [
  "....................................",
  "..........................,,,.......",
  "...........................,........",
  "...=====....====...........,........",
  "...=====....====...........,........",
  "...=====.....=.............,........",
  "....=........,.............,........",
  "..,,,,,,,,,,,,,,,,,,,,,,,,,,,.......",
  "..........,.................,.......",
  "..........,.................,.......",
  "...====...,....====.........,.......",
  "...====...,....====.........,.......",
  "...====...,....====.........,.......",
  ".....=....,......=..........,.......",
  "..........,.................,.......",
  "..........,.................,.......",
  "............................=.......",
  ".......======...............=====...",
  ".......======...............=.......",
  ".......======...............=.......",
  ".........=..................====....",
  "..,,,,,,,,,,,,,,,,,,,,,,,,,,,.......",
  "....................................",
  "....................................",
];

const TOWN_DECOR_OVERLAY: readonly string[] = [
  "....................................",
  "....................................",
  "....................................",
  "....................................",
  "....................................",
  "......o.............................",
  "....i...............................",
  "....................................",
  "....................................",
  "....................................",
  "....................................",
  "...o..............o.................",
  "...............c....................",
  "....................................",
  "....................................",
  "....................................",
  "............................o.......",
  "....................................",
  "....................................",
  "....................................",
  "....................................",
  "............................o.......",
  "....................................",
  "....................................",
];

// Authoritative 18x28 cove layout — transcribe exactly, do not hand-tune.
// See docs/superpowers/plans/2026-07-09-m4-storied-world.md Task 12 Step 2
// for the coordinate table and "why this geometry" encounter-design notes.
const COVE_LAYOUT: readonly string[] = [
  "############################",
  "############################",
  "########............########",
  "##..............4g2.########",
  "##.#####............########",
  "##.###########.#############",
  "##.###########.#############",
  "##.###########.#############",
  "##.#.....................###",
  "##.#........l.n.m........###",
  "##.#.....................###",
  "##.#.....................###",
  "##.###########.#############",
  "##........................##",
  "#..........................#",
  "#............PbQ...........#",
  "#..........................#",
  "############################",
];

const COVE_LOCATION_LEGEND: Readonly<Record<string, string>> = {
  g: "cove_cellar",
  l: "cove_west",
  n: "cove_mouth",
  m: "cove_east",
  b: "cove_beach",
};

const COVE_ITEM_LEGEND: Readonly<Record<string, string>> = {
  "4": "base:pearl_strand",
  "2": "base:rum_bottle",
};

const COVE_PORTAL_LEGEND: Readonly<Record<string, PortalTarget>> = {
  Q: { toMapId: "port_town", toLocation: "north_road" },
};

const COVE_GROUND_OVERLAY: readonly string[] = [
  "............................",
  "............................",
  "............................",
  "............................",
  "............................",
  "............................",
  "............................",
  "............................",
  "............................",
  "............................",
  "............................",
  "............................",
  "............................",
  "..,,,,,,,,,,,,,,,,,,,,,,,,..",
  ".,,,,,,,,,,,,,,,,,,,,,,,,,,.",
  ".,,,,,,,,,,,,,,,,,,,,,,,,,,.",
  ".,,,,,,,,,,,,,,,,,,,,,,,,,,.",
  "............................",
];

const COVE_DECOR_OVERLAY: readonly string[] = [
  "............................",
  "............................",
  "............................",
  "...................c........",
  "............................",
  "............................",
  "............................",
  "............................",
  "............................",
  ".....o......................",
  "............................",
  "............................",
  "............................",
  "............................",
  "............................",
  "...........o................",
  "............................",
  "............................",
];

export const MAPS: readonly MapSpec[] = [
  {
    id: "port_town",
    theme: "coast",
    layout: TOWN_LAYOUT,
    locationLegend: TOWN_LOCATION_LEGEND,
    itemLegend: TOWN_ITEM_LEGEND,
    portalLegend: TOWN_PORTAL_LEGEND,
    groundOverlay: TOWN_GROUND_OVERLAY,
    decorOverlay: TOWN_DECOR_OVERLAY,
  },
  {
    id: "smugglers_cove",
    theme: "cave",
    layout: COVE_LAYOUT,
    locationLegend: COVE_LOCATION_LEGEND,
    itemLegend: COVE_ITEM_LEGEND,
    portalLegend: COVE_PORTAL_LEGEND,
    groundOverlay: COVE_GROUND_OVERLAY,
    decorOverlay: COVE_DECOR_OVERLAY,
  },
];

function checkOverlay(spec: MapSpec, overlay: readonly string[] | undefined, label: string): void {
  if (overlay === undefined) {
    return;
  }
  if (overlay.length !== spec.layout.length) {
    const rows = String(overlay.length);
    const want = String(spec.layout.length);
    throw new Error(`map "${spec.id}": ${label} overlay has ${rows} rows, want ${want}`);
  }
  overlay.forEach((row, y) => {
    const expected = spec.layout[y]?.length ?? 0;
    if (row.length !== expected) {
      const got = String(row.length);
      const want = String(expected);
      const at = `${label} overlay row ${String(y)}`;
      throw new Error(`map "${spec.id}": ${at} is ${got} chars, want ${want}`);
    }
  });
}

for (const spec of MAPS) {
  checkOverlay(spec, spec.groundOverlay, "ground");
  checkOverlay(spec, spec.decorOverlay, "decor");
}

function isLand(spec: MapSpec, x: number, y: number): boolean {
  const ch = spec.layout[y]?.[x];
  return ch !== undefined && ch !== "~" && ch !== "#";
}

function waterGid(spec: MapSpec, x: number, y: number): number {
  const n = isLand(spec, x, y - 1);
  const s = isLand(spec, x, y + 1);
  const w = isLand(spec, x - 1, y);
  const e = isLand(spec, x + 1, y);
  if (n && w) return gid("water_corner_nw");
  if (n && e) return gid("water_corner_ne");
  if (s && w) return gid("water_corner_sw");
  if (s && e) return gid("water_corner_se");
  if (n) return gid("water_edge_n");
  if (s) return gid("water_edge_s");
  if (w) return gid("water_edge_w");
  if (e) return gid("water_edge_e");
  if (isLand(spec, x - 1, y - 1)) return gid("water_inner_nw");
  if (isLand(spec, x + 1, y - 1)) return gid("water_inner_ne");
  if (isLand(spec, x - 1, y + 1)) return gid("water_inner_sw");
  if (isLand(spec, x + 1, y + 1)) return gid("water_inner_se");
  return gid("water");
}

// Buildings are hollow (enterable) with 1-tile walls, so a facade/roof split
// has no consistent orientation — uniform brick per structure reads best.
function wallGid(spec: MapSpec, x: number, y: number, width: number, height: number): number {
  if (spec.theme === "cave") {
    return gid("cave_wall");
  }
  if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
    return gid("wall_stone");
  }
  return gid("wall_brick");
}

function groundGid(spec: MapSpec, x: number, y: number): number {
  const mark = spec.groundOverlay?.[y]?.[x];
  if (mark === ",") return gid("dirt");
  if (mark === "=") return gid("planks");
  if (spec.theme === "cave") return gid("cave_floor");
  return (x * 7 + y * 13) % 11 === 0 ? gid("grass_tufts") : gid("grass");
}

interface Placed extends Vec2 {
  readonly name: string;
}

interface ParsedLayout {
  readonly width: number;
  readonly height: number;
  readonly ground: number[];
  readonly walls: number[];
  readonly decor: number[];
  readonly spawn: Vec2;
  readonly locations: Placed[];
  readonly items: Placed[];
  readonly portals: readonly Placed[];
}

function parseLayout(spec: MapSpec): ParsedLayout {
  const height = spec.layout.length;
  const width = spec.layout[0]?.length ?? 0;
  if (spec.layout.some((row) => row.length !== width)) {
    throw new Error(`map "${spec.id}": layout rows must all have the same length`);
  }

  const ground: number[] = [];
  const walls: number[] = [];
  const locations: Placed[] = [];
  const items: Placed[] = [];
  const portals: Placed[] = [];
  let spawn: Vec2 | undefined;

  spec.layout.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      ground.push(groundGid(spec, x, y));
      if (ch === "#") {
        walls.push(wallGid(spec, x, y, width, height));
      } else if (ch === "~") {
        walls.push(waterGid(spec, x, y));
      } else {
        walls.push(0);
      }
      if (ch === "P") {
        spawn = { x, y };
      }
      const locationName = spec.locationLegend[ch];
      if (locationName !== undefined) {
        locations.push({ name: locationName, x, y });
      }
      const itemId = spec.itemLegend[ch];
      if (itemId !== undefined) {
        items.push({ name: itemId, x, y });
      }
      const portalTarget = spec.portalLegend[ch];
      if (portalTarget !== undefined) {
        const name = `${portalTarget.toMapId}/${portalTarget.toLocation}`;
        portals.push({ name, x, y });
      }
    });
  });

  if (spawn === undefined) {
    throw new Error(`map "${spec.id}": layout has no P (player spawn) tile`);
  }

  const decor: number[] = Array.from<number>({ length: width * height }).fill(0);
  (spec.decorOverlay ?? []).forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === "o") {
        decor[y * width + x] = gid("barrel_bottom");
        if (y > 0) {
          decor[(y - 1) * width + x] = gid("barrel_top");
        }
      } else if (ch === "c") {
        decor[y * width + x] = gid("chest");
      } else if (ch === "i") {
        decor[y * width + x] = gid("sign_inn");
      }
    });
  });

  return { width, height, ground, walls, decor, spawn, locations, items, portals };
}

function objectGroup(
  id: number,
  name: string,
  firstObjectId: number,
  placed: readonly Placed[],
): object {
  return {
    id,
    name,
    type: "objectgroup",
    objects: placed.map((object, index) => ({
      id: firstObjectId + index,
      name: object.name,
      x: object.x * TILE,
      y: object.y * TILE,
      width: TILE,
      height: TILE,
      rotation: 0,
      visible: true,
      point: false,
    })),
    opacity: 1,
    visible: true,
    x: 0,
    y: 0,
  };
}

function tileLayer(
  id: number,
  name: string,
  width: number,
  height: number,
  data: number[],
): object {
  return {
    id,
    name,
    type: "tilelayer",
    width,
    height,
    data,
    opacity: 1,
    visible: true,
    x: 0,
    y: 0,
  };
}

interface BuiltMap {
  readonly json: object;
  readonly width: number;
  readonly height: number;
  readonly spawn: Vec2;
}

export function buildMap(spec: MapSpec): BuiltMap {
  const parsed = parseLayout(spec);
  const { width, height, spawn } = parsed;
  const itemsFirstId = 2 + parsed.locations.length;
  const portalsFirstId = itemsFirstId + parsed.items.length;
  const nextObjectId = portalsFirstId + parsed.portals.length;

  const json = {
    type: "map",
    version: "1.10",
    orientation: "orthogonal",
    renderorder: "right-down",
    infinite: false,
    width,
    height,
    tilewidth: TILE,
    tileheight: TILE,
    nextlayerid: 8,
    nextobjectid: nextObjectId,
    tilesets: [
      {
        firstgid: 1,
        name: "lpc_base",
        tilewidth: TILE,
        tileheight: TILE,
        tilecount: TILES.length,
        columns: TILESET_COLUMNS,
        image: "../assets/tileset.png",
        imagewidth: TILESET_COLUMNS * TILE,
        imageheight: Math.ceil(TILES.length / TILESET_COLUMNS) * TILE,
        margin: 0,
        spacing: 0,
      },
    ],
    layers: [
      tileLayer(1, "ground", width, height, parsed.ground),
      tileLayer(7, "decor", width, height, parsed.decor),
      tileLayer(2, "walls", width, height, parsed.walls),
      objectGroup(3, "spawns", 1, [{ name: "player", x: spawn.x, y: spawn.y }]),
      objectGroup(4, "locations", 2, parsed.locations),
      objectGroup(5, "items", itemsFirstId, parsed.items),
      objectGroup(6, "portals", portalsFirstId, parsed.portals),
    ],
  };

  return { json, width, height, spawn };
}
