import { writeFileSync } from "node:fs";

interface Vec2 {
  readonly x: number;
  readonly y: number;
}

interface PortalTarget {
  readonly toMapId: string;
  readonly toLocation: string;
}

interface MapSpec {
  readonly id: string;
  readonly layout: readonly string[];
  readonly locationLegend: Readonly<Record<string, string>>;
  readonly itemLegend: Readonly<Record<string, string>>;
  readonly portalLegend: Readonly<Record<string, PortalTarget>>;
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

const MAPS: readonly MapSpec[] = [
  {
    id: "port_town",
    layout: TOWN_LAYOUT,
    locationLegend: TOWN_LOCATION_LEGEND,
    itemLegend: TOWN_ITEM_LEGEND,
    portalLegend: TOWN_PORTAL_LEGEND,
  },
  {
    id: "smugglers_cove",
    layout: COVE_LAYOUT,
    locationLegend: COVE_LOCATION_LEGEND,
    itemLegend: COVE_ITEM_LEGEND,
    portalLegend: COVE_PORTAL_LEGEND,
  },
];

const TILE = 32;
const GID_GROUND = 1;
const GID_WALL = 2;
const GID_WATER = 3;

interface Placed extends Vec2 {
  readonly name: string;
}

interface ParsedLayout {
  readonly width: number;
  readonly height: number;
  readonly ground: number[];
  readonly walls: number[];
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
      ground.push(GID_GROUND);
      walls.push(ch === "#" ? GID_WALL : ch === "~" ? GID_WATER : 0);
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

  return { width, height, ground, walls, spawn, locations, items, portals };
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

function buildMap(spec: MapSpec): BuiltMap {
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
    nextlayerid: 7,
    nextobjectid: nextObjectId,
    tilesets: [
      {
        firstgid: 1,
        name: "placeholder",
        tilewidth: TILE,
        tileheight: TILE,
        tilecount: 3,
        columns: 3,
        image: "placeholder.png",
        imagewidth: 96,
        imageheight: 32,
        margin: 0,
        spacing: 0,
      },
    ],
    layers: [
      tileLayer(1, "ground", width, height, parsed.ground),
      tileLayer(2, "walls", width, height, parsed.walls),
      objectGroup(3, "spawns", 1, [{ name: "player", x: spawn.x, y: spawn.y }]),
      objectGroup(4, "locations", 2, parsed.locations),
      objectGroup(5, "items", itemsFirstId, parsed.items),
      objectGroup(6, "portals", portalsFirstId, parsed.portals),
    ],
  };

  return { json, width, height, spawn };
}

for (const spec of MAPS) {
  const built = buildMap(spec);
  const outPath = `packages/content/packs/base/maps/${spec.id}.map.json`;
  writeFileSync(outPath, `${JSON.stringify(built.json, null, 2)}\n`);
  console.log(
    `wrote ${outPath} (${built.width}x${built.height}, spawn at ${built.spawn.x},${built.spawn.y})`,
  );
}
