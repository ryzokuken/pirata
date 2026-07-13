export const TILE = 32;
export const TILESET_COLUMNS = 8;

export interface TileDef {
  readonly name: string;
  /** Sheet path inside the zip, relative to "LPC Base Assets/tiles/". */
  readonly sheet: string;
  readonly sx: number;
  readonly sy: number;
}

/** GID = index + 1. Order is load-bearing: the generated maps bake these numbers. */
export const TILES: readonly TileDef[] = [
  { name: "grass", sheet: "grass.png", sx: 0, sy: 160 },
  { name: "grass_tufts", sheet: "grass.png", sx: 32, sy: 160 },
  { name: "dirt", sheet: "dirt.png", sx: 0, sy: 160 },
  { name: "planks", sheet: "bridges.png", sx: 32, sy: 96 },
  { name: "wall_stone", sheet: "house.png", sx: 128, sy: 128 },
  { name: "wall_brick", sheet: "house.png", sx: 32, sy: 32 },
  { name: "roof", sheet: "house.png", sx: 0, sy: 128 },
  { name: "water", sheet: "watergrass.png", sx: 32, sy: 96 },
  { name: "water_edge_n", sheet: "watergrass.png", sx: 32, sy: 64 },
  { name: "water_edge_s", sheet: "watergrass.png", sx: 32, sy: 128 },
  { name: "water_edge_w", sheet: "watergrass.png", sx: 0, sy: 96 },
  { name: "water_edge_e", sheet: "watergrass.png", sx: 64, sy: 96 },
  { name: "water_corner_nw", sheet: "watergrass.png", sx: 0, sy: 64 },
  { name: "water_corner_ne", sheet: "watergrass.png", sx: 64, sy: 64 },
  { name: "water_corner_sw", sheet: "watergrass.png", sx: 0, sy: 128 },
  { name: "water_corner_se", sheet: "watergrass.png", sx: 64, sy: 128 },
  { name: "water_inner_se", sheet: "watergrass.png", sx: 32, sy: 0 },
  { name: "water_inner_sw", sheet: "watergrass.png", sx: 64, sy: 0 },
  { name: "water_inner_ne", sheet: "watergrass.png", sx: 32, sy: 32 },
  { name: "water_inner_nw", sheet: "watergrass.png", sx: 64, sy: 32 },
  { name: "barrel_top", sheet: "barrel.png", sx: 0, sy: 0 },
  { name: "barrel_bottom", sheet: "barrel.png", sx: 0, sy: 32 },
  { name: "chest", sheet: "chests.png", sx: 0, sy: 0 },
  { name: "sign_inn", sheet: "signs.png", sx: 0, sy: 0 },
  { name: "cave_wall", sheet: "hole.png", sx: 0, sy: 160 },
  { name: "cave_floor", sheet: "dirt2.png", sx: 0, sy: 160 },
];

export function gid(name: string): number {
  const index = TILES.findIndex((tile) => tile.name === name);
  if (index === -1) {
    throw new Error(`unknown tile "${name}" (not in tileset-manifest TILES)`);
  }
  return index + 1;
}
