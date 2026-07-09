import { describe, expect, it } from "vitest";
import { buyPrice, sellPrice, tradeRefused } from "./trade.ts";
import { createGameState, type GameState } from "./state.ts";
import { fixtureWorld } from "./world.fixture.ts";

const world = fixtureWorld();

// The keeper (test:guild) sells test:trinket (value 10); test:pearl is value 15.
function withGuildStanding(delta: number): GameState {
  const state = createGameState({ seed: 1, world });
  if (delta === 0) {
    return state;
  }
  const deedId = delta > 0 ? "test:praise" : "test:slight";
  const count = Math.abs(delta) / 10;
  return {
    ...state,
    deeds: Array.from({ length: count }, (_, tick) => ({
      deedId,
      npcId: "test:keeper",
      tick,
      knownBy: ["test:keeper"],
    })),
  };
}

describe("trade prices track faction standing (golden values)", () => {
  it("neutral: face value buy, half value sell", () => {
    const state = withGuildStanding(0);
    expect(tradeRefused(state, world, "test:keeper")).toBe(false);
    expect(buyPrice(state, world, "test:keeper", "test:trinket")).toBe(10);
    expect(sellPrice(state, world, "test:keeper", "test:pearl")).toBe(7);
  });

  it("wary (below 0): markup and lowball", () => {
    const state = withGuildStanding(-10);
    expect(tradeRefused(state, world, "test:keeper")).toBe(false);
    expect(buyPrice(state, world, "test:keeper", "test:trinket")).toBe(15);
    expect(sellPrice(state, world, "test:keeper", "test:pearl")).toBe(3);
  });

  it("hostile (-20 and below): refuses outright", () => {
    expect(tradeRefused(withGuildStanding(-20), world, "test:keeper")).toBe(true);
  });

  it("friendly (25 and up): discount and fair offers", () => {
    const state = withGuildStanding(30);
    expect(buyPrice(state, world, "test:keeper", "test:trinket")).toBe(8);
    expect(sellPrice(state, world, "test:keeper", "test:pearl")).toBe(9);
  });

  it("returns undefined for an unknown item", () => {
    const state = withGuildStanding(0);
    expect(buyPrice(state, world, "test:keeper", "test:ghost")).toBeUndefined();
  });
});
