import { describe, expect, it } from "vitest";
import { HUNGER_MAX, HUNGRY_AT, hungerStage, STARVING_AT, TICKS_PER_HUNGER } from "./hunger.ts";

describe("hunger stages (golden)", () => {
  it("pins the constants", () => {
    expect(TICKS_PER_HUNGER).toBe(10);
    expect(HUNGRY_AT).toBe(12);
    expect(STARVING_AT).toBe(24);
    expect(HUNGER_MAX).toBe(30);
  });

  it("maps hunger to stages", () => {
    expect(hungerStage(0)).toBe("fed");
    expect(hungerStage(11)).toBe("fed");
    expect(hungerStage(12)).toBe("hungry");
    expect(hungerStage(23)).toBe("hungry");
    expect(hungerStage(24)).toBe("starving");
    expect(hungerStage(30)).toBe("starving");
  });
});
