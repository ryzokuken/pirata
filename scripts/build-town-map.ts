import { writeFileSync } from "node:fs";

const LAYOUT: readonly string[] = [
  "########################",
  "#................~~~~~~#",
  "#.####..####.....~~~~~~#",
  "#.#BH#..#M.#.....~~~~~~#",
  "#.#C.#..##.#......~~~~~#",
  "#.##.#...........P..~~~#",
  "#.................~~~~~#",
  "#.####..####......~~~~~#",
  "#.#..#..#..#......~~~~~#",
  "#.#..#..##.#......~~~~~#",
  "#.##.#...........N~~~~~#",
  "#................S~~~~~#",
  "#.......####.......~~~~#",
  "#.......#..#.......~~~~#",
  "#.......##.#......~~~~~#",
  "########################",
];

const LOCATION_LEGEND: Readonly<Record<string, string>> = {
  B: "tavern_bar",
  H: "tavern_hearth",
  C: "tavern_corner",
  M: "market",
  N: "dock_north",
  S: "dock_south",
};

const TILE = 32;
const GID_GROUND = 1;
const GID_WALL = 2;
const GID_WATER = 3;

const height = LAYOUT.length;
const width = LAYOUT[0]?.length ?? 0;
if (LAYOUT.some((row) => row.length !== width)) {
  throw new Error("layout rows must all have the same length");
}

const ground: number[] = [];
const walls: number[] = [];
const locations: { name: string; x: number; y: number }[] = [];
let spawn: { x: number; y: number } | undefined;

LAYOUT.forEach((row, y) => {
  [...row].forEach((ch, x) => {
    ground.push(GID_GROUND);
    if (ch === "#") {
      walls.push(GID_WALL);
    } else if (ch === "~") {
      walls.push(GID_WATER);
    } else {
      walls.push(0);
    }
    if (ch === "P") {
      spawn = { x, y };
    }
    const locationName = LOCATION_LEGEND[ch];
    if (locationName !== undefined) {
      locations.push({ name: locationName, x, y });
    }
  });
});

if (spawn === undefined) {
  throw new Error("layout has no P (player spawn) tile");
}

const map = {
  type: "map",
  version: "1.10",
  orientation: "orthogonal",
  renderorder: "right-down",
  infinite: false,
  width,
  height,
  tilewidth: TILE,
  tileheight: TILE,
  nextlayerid: 5,
  nextobjectid: 2 + locations.length,
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
    {
      id: 1,
      name: "ground",
      type: "tilelayer",
      width,
      height,
      data: ground,
      opacity: 1,
      visible: true,
      x: 0,
      y: 0,
    },
    {
      id: 2,
      name: "walls",
      type: "tilelayer",
      width,
      height,
      data: walls,
      opacity: 1,
      visible: true,
      x: 0,
      y: 0,
    },
    {
      id: 3,
      name: "spawns",
      type: "objectgroup",
      objects: [
        {
          id: 1,
          name: "player",
          x: spawn.x * TILE,
          y: spawn.y * TILE,
          width: TILE,
          height: TILE,
          rotation: 0,
          visible: true,
          point: false,
        },
      ],
      opacity: 1,
      visible: true,
      x: 0,
      y: 0,
    },
    {
      id: 4,
      name: "locations",
      type: "objectgroup",
      objects: locations.map((location, index) => ({
        id: 2 + index,
        name: location.name,
        x: location.x * TILE,
        y: location.y * TILE,
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
    },
  ],
};

const outPath = "packages/content/packs/base/maps/port_town.map.json";
writeFileSync(outPath, `${JSON.stringify(map, null, 2)}\n`);
console.log(`wrote ${outPath} (${width}x${height}, spawn at ${spawn.x},${spawn.y})`);
