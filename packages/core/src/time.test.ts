import { describe, expect, it } from "vitest";
import { clockOf, hourOf, TICKS_PER_DAY, TICKS_PER_HOUR } from "./time.ts";

describe("game clock", () => {
  it("starts day 1 at 08:00", () => {
    expect(clockOf(0)).toEqual({ day: 1, hour: 8, minute: 0 });
  });

  it("advances 6 minutes per tick", () => {
    expect(clockOf(1)).toEqual({ day: 1, hour: 8, minute: 6 });
    expect(clockOf(7)).toEqual({ day: 1, hour: 8, minute: 42 });
  });

  it("rolls hours and days (golden values)", () => {
    expect(clockOf(10)).toEqual({ day: 1, hour: 9, minute: 0 });
    expect(clockOf(159)).toEqual({ day: 1, hour: 23, minute: 54 });
    expect(clockOf(160)).toEqual({ day: 2, hour: 0, minute: 0 });
    expect(clockOf(240)).toEqual({ day: 2, hour: 8, minute: 0 });
  });

  it("exposes hourOf as a shorthand", () => {
    expect(hourOf(110)).toBe(19);
  });

  it("keeps the day length consistent", () => {
    expect(TICKS_PER_DAY).toBe(TICKS_PER_HOUR * 24);
  });
});
