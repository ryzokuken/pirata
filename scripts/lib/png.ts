import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

export function createPng(width: number, height: number): PNG {
  return new PNG({ width, height });
}

export function readPngFile(path: string): PNG {
  return PNG.sync.read(readFileSync(path));
}

export function readPngBuffer(buffer: Buffer): PNG {
  return PNG.sync.read(buffer);
}

export function writePngFile(path: string, png: PNG): void {
  writeFileSync(path, PNG.sync.write(png));
}

/** Alpha-composite `src` over `dst` in place. Both images must be the same size. */
export function blit(dst: PNG, src: PNG): void {
  if (dst.width !== src.width || dst.height !== src.height) {
    throw new Error(
      `blit dimensions differ: ${String(dst.width)}x${String(dst.height)} vs ${String(src.width)}x${String(src.height)}`,
    );
  }
  for (let i = 0; i < dst.data.length; i += 4) {
    const sa = (src.data[i + 3] ?? 0) / 255;
    if (sa === 0) {
      continue;
    }
    const da = (dst.data[i + 3] ?? 0) / 255;
    const outA = sa + da * (1 - sa);
    for (let c = 0; c < 3; c += 1) {
      const sc = src.data[i + c] ?? 0;
      const dc = dst.data[i + c] ?? 0;
      dst.data[i + c] = Math.round((sc * sa + dc * da * (1 - sa)) / outA);
    }
    dst.data[i + 3] = Math.round(outA * 255);
  }
}

/** Copy a `w`x`h` rectangle from `src` at (sx, sy) onto `dst` at (dx, dy), alpha-compositing. */
export function blitRegion(
  dst: PNG,
  src: PNG,
  sx: number,
  sy: number,
  w: number,
  h: number,
  dx: number,
  dy: number,
): void {
  const region = createPng(w, h);
  PNG.bitblt(src, region, sx, sy, w, h, 0, 0);
  const patch = createPng(w, h);
  PNG.bitblt(dst, patch, dx, dy, w, h, 0, 0);
  blit(patch, region);
  PNG.bitblt(patch, dst, 0, 0, w, h, dx, dy);
}

function parseHex(hex: string): readonly [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/** Replace each `from[i]` color with `to[i]` (exact RGB match); returns replaced pixel count. */
export function recolorRamp(png: PNG, from: readonly string[], to: readonly string[]): number {
  if (from.length !== to.length) {
    throw new Error(`ramp length mismatch: ${String(from.length)} vs ${String(to.length)}`);
  }
  const map = new Map<number, readonly [number, number, number]>();
  from.forEach((hex, i) => {
    const [r, g, b] = parseHex(hex);
    const target = to[i];
    if (target !== undefined) {
      map.set((r << 16) | (g << 8) | b, parseHex(target));
    }
  });
  let replaced = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if ((png.data[i + 3] ?? 0) === 0) {
      continue;
    }
    const key = ((png.data[i] ?? 0) << 16) | ((png.data[i + 1] ?? 0) << 8) | (png.data[i + 2] ?? 0);
    const target = map.get(key);
    if (target !== undefined) {
      [png.data[i], png.data[i + 1], png.data[i + 2]] = target;
      replaced += 1;
    }
  }
  return replaced;
}

/** Find the palette ramp with the most distinct colors present in the image (≥4 required). */
export function detectRamp(
  png: PNG,
  palette: Readonly<Record<string, readonly string[]>>,
): string | undefined {
  const present = new Set<number>();
  for (let i = 0; i < png.data.length; i += 4) {
    if ((png.data[i + 3] ?? 0) !== 0) {
      present.add(
        ((png.data[i] ?? 0) << 16) | ((png.data[i + 1] ?? 0) << 8) | (png.data[i + 2] ?? 0),
      );
    }
  }
  let best: string | undefined;
  let bestHits = 3;
  for (const [name, ramp] of Object.entries(palette)) {
    let hits = 0;
    for (const hex of ramp) {
      const [r, g, b] = parseHex(hex);
      if (present.has((r << 16) | (g << 8) | b)) {
        hits += 1;
      }
    }
    if (hits > bestHits) {
      best = name;
      bestHits = hits;
    }
  }
  return best;
}
