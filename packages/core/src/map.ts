import type { Vec2 } from "./state.ts";

export interface MapModel {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly blocked: readonly boolean[];
  readonly playerSpawn: Vec2;
  readonly locations: Readonly<Record<string, Vec2>>;
}

interface TiledObject {
  readonly name: string;
  readonly x: number;
  readonly y: number;
}

interface TiledLayer {
  readonly name: string;
  readonly type: string;
  readonly data?: readonly number[];
  readonly objects?: readonly TiledObject[];
}

interface TiledMap {
  readonly width: number;
  readonly height: number;
  readonly tilewidth: number;
  readonly tileheight: number;
  readonly layers: readonly TiledLayer[];
}

export class MapParseError extends Error {}

export function parseTiledMap(id: string, raw: unknown): MapModel {
  const map = raw as Partial<TiledMap>;
  if (typeof map.width !== "number" || typeof map.height !== "number") {
    throw new MapParseError(`map "${id}": missing numeric width/height`);
  }
  if (typeof map.tilewidth !== "number" || typeof map.tileheight !== "number") {
    throw new MapParseError(`map "${id}": missing numeric tilewidth/tileheight`);
  }
  const layers = Array.isArray(map.layers) ? (map.layers as TiledLayer[]) : [];

  const walls = layers.find((layer) => layer.type === "tilelayer" && layer.name === "walls");
  if (walls?.data === undefined) {
    throw new MapParseError(`map "${id}": missing "walls" tile layer (add it in Tiled)`);
  }
  const expected = map.width * map.height;
  if (walls.data.length !== expected) {
    throw new MapParseError(
      `map "${id}": "walls" layer has ${walls.data.length} tiles, expected ${expected}`,
    );
  }

  const spawns = layers.find((layer) => layer.type === "objectgroup" && layer.name === "spawns");
  const player = spawns?.objects?.find((object) => object.name === "player");
  if (player === undefined) {
    throw new MapParseError(
      `map "${id}": missing "player" object in a "spawns" object layer (add it in Tiled)`,
    );
  }

  const playerSpawn = {
    x: Math.floor(player.x / map.tilewidth),
    y: Math.floor(player.y / map.tileheight),
  };
  if (
    playerSpawn.x < 0 ||
    playerSpawn.y < 0 ||
    playerSpawn.x >= map.width ||
    playerSpawn.y >= map.height
  ) {
    throw new MapParseError(
      `map "${id}": player spawn at (${playerSpawn.x},${playerSpawn.y}) is outside the map (${map.width}x${map.height})`,
    );
  }

  const blocked = walls.data.map((gid) => gid !== 0);

  const locations: Record<string, Vec2> = {};
  const locationLayer = layers.find(
    (layer) => layer.type === "objectgroup" && layer.name === "locations",
  );
  for (const object of locationLayer?.objects ?? []) {
    const pos = {
      x: Math.floor(object.x / map.tilewidth),
      y: Math.floor(object.y / map.tileheight),
    };
    if (locations[object.name] !== undefined) {
      throw new MapParseError(`map "${id}": duplicate location "${object.name}"`);
    }
    const outOfBounds = pos.x < 0 || pos.y < 0 || pos.x >= map.width || pos.y >= map.height;
    if (outOfBounds || (blocked[pos.y * map.width + pos.x] ?? true)) {
      throw new MapParseError(
        `map "${id}": location "${object.name}" at (${pos.x},${pos.y}) is not on walkable ground`,
      );
    }
    locations[object.name] = pos;
  }

  return {
    id,
    width: map.width,
    height: map.height,
    blocked,
    playerSpawn,
    locations,
  };
}

export function isBlocked(map: MapModel, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
    return true;
  }
  return map.blocked[y * map.width + x] ?? true;
}
