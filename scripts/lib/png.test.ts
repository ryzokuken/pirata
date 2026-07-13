import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { blit, blitRegion, createPng, detectRamp, recolorRamp } from "./png.ts";

function pixel(png: PNG, x: number, y: number): readonly [number, number, number, number] {
  const i = (png.width * y + x) * 4;
  return [png.data[i] ?? 0, png.data[i + 1] ?? 0, png.data[i + 2] ?? 0, png.data[i + 3] ?? 0];
}

function fill(png: PNG, rgba: readonly [number, number, number, number]): void {
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgba[0];
    png.data[i + 1] = rgba[1];
    png.data[i + 2] = rgba[2];
    png.data[i + 3] = rgba[3];
  }
}

describe("blit", () => {
  it("copies opaque source pixels over the destination", () => {
    const dst = createPng(2, 2);
    fill(dst, [10, 20, 30, 255]);
    const src = createPng(2, 2);
    fill(src, [200, 100, 50, 255]);
    blit(dst, src);
    expect(pixel(dst, 1, 1)).toEqual([200, 100, 50, 255]);
  });

  it("leaves the destination alone where the source is transparent", () => {
    const dst = createPng(1, 1);
    fill(dst, [10, 20, 30, 255]);
    const src = createPng(1, 1);
    blit(dst, src);
    expect(pixel(dst, 0, 0)).toEqual([10, 20, 30, 255]);
  });

  it("alpha-blends semi-transparent source pixels (golden value)", () => {
    const dst = createPng(1, 1);
    fill(dst, [0, 0, 0, 255]);
    const src = createPng(1, 1);
    fill(src, [255, 255, 255, 128]);
    blit(dst, src);
    // out = 255*(128/255) + 0*(1 - 128/255) = 128, alpha stays 255
    expect(pixel(dst, 0, 0)).toEqual([128, 128, 128, 255]);
  });

  it("rejects mismatched dimensions", () => {
    expect(() => {
      blit(createPng(2, 2), createPng(1, 1));
    }).toThrow(/dimensions/);
  });
});

describe("blitRegion", () => {
  it("copies a source rectangle to the destination offset", () => {
    const src = createPng(4, 4);
    fill(src, [9, 9, 9, 255]);
    const dst = createPng(4, 4);
    blitRegion(dst, src, 0, 0, 2, 2, 2, 2);
    expect(pixel(dst, 3, 3)).toEqual([9, 9, 9, 255]);
    expect(pixel(dst, 0, 0)).toEqual([0, 0, 0, 0]);
  });
});

describe("recolorRamp", () => {
  it("replaces ramp colors positionally and reports the pixel count", () => {
    const png = createPng(2, 1);
    fill(png, [0xe5, 0xe6, 0xc7, 255]); // cloth "white" ramp, 5th color
    const replaced = recolorRamp(png, ["#C4B59F", "#E5E6C7"], ["#111111", "#2277EE"]);
    expect(replaced).toBe(2);
    expect(pixel(png, 0, 0)).toEqual([0x22, 0x77, 0xee, 255]);
  });

  it("rejects ramps of different lengths", () => {
    const png = createPng(1, 1);
    expect(() => recolorRamp(png, ["#000000"], [])).toThrow(/length/);
  });
});

describe("detectRamp", () => {
  it("finds the ramp whose colors appear most in the image", () => {
    const png = createPng(4, 1);
    const ramp = ["#281820", "#4D4A5D", "#958080", "#C4B59F"];
    ramp.forEach((hex, x) => {
      const i = x * 4;
      png.data[i] = Number.parseInt(hex.slice(1, 3), 16);
      png.data[i + 1] = Number.parseInt(hex.slice(3, 5), 16);
      png.data[i + 2] = Number.parseInt(hex.slice(5, 7), 16);
      png.data[i + 3] = 255;
    });
    const palette = {
      white: ["#281820", "#4D4A5D", "#958080", "#C4B59F", "#E5E6C7", "#FFFFFF"],
      blue: ["#180716", "#281E41", "#322D6A", "#3C49AD", "#466AC9", "#61A0EF"],
    };
    expect(detectRamp(png, palette)).toBe("white");
  });

  it("returns undefined when no ramp reaches four distinct hits", () => {
    const png = createPng(1, 1);
    expect(detectRamp(png, { white: ["#010101", "#020202", "#030303", "#040404"] })).toBe(
      undefined,
    );
  });
});
