import { describe, expect, it } from "vitest";
import { nextFloat, nextInt, seedRng } from "./rng.ts";

describe("seeded rng", () => {
  it("produces the same sequence for the same seed", () => {
    let a = seedRng(1234);
    let b = seedRng(1234);
    for (let i = 0; i < 100; i += 1) {
      const ra = nextFloat(a);
      const rb = nextFloat(b);
      expect(ra.value).toBe(rb.value);
      a = ra.state;
      b = rb.state;
    }
  });

  it("produces different first values for different seeds", () => {
    expect(nextFloat(seedRng(1)).value).not.toBe(nextFloat(seedRng(2)).value);
  });

  it("matches the mulberry32 golden sequence for seed 1234", () => {
    let state = seedRng(1234);
    const values: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const r = nextFloat(state);
      values.push(r.value);
      state = r.state;
    }
    expect(values).toEqual([
      0.07329497812315822, 0.7034119898453355, 0.9028560190927237, 0.9705493662040681,
      0.04096397617831826,
    ]);
  });

  it("keeps floats in [0, 1)", () => {
    let state = seedRng(99);
    for (let i = 0; i < 1000; i += 1) {
      const r = nextFloat(state);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(1);
      state = r.state;
    }
  });

  it("keeps ints in [0, max)", () => {
    let state = seedRng(7);
    for (let i = 0; i < 1000; i += 1) {
      const r = nextInt(state, 6);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(6);
      state = r.state;
    }
  });
});
