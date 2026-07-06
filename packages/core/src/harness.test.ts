import { describe, expect, it } from "vitest";
import { runScenario } from "./harness.ts";
import type { Intent } from "./intent.ts";
import { fixtureWorld } from "./world.fixture.ts";

const WALK_TO_KEEPER: readonly Intent[] = [
  { type: "move", direction: "south" },
  { type: "move", direction: "south" },
  { type: "move", direction: "east" },
  { type: "move", direction: "east" },
  { type: "move", direction: "east" },
];

describe("scenario: flattery opens doors", () => {
  it("praising the keeper unlocks their secret and lifts guild standing", () => {
    const { state, events } = runScenario({
      world: fixtureWorld(),
      seed: 7,
      intents: [
        ...WALK_TO_KEEPER,
        { type: "talk" },
        { type: "choose", index: 0 }, // Compliment (+10, → smile)
        { type: "choose", index: 0 }, // Bye (end)
        { type: "talk" },
        { type: "choose", index: 2 }, // Secret? — visible only at standing ≥ 10
      ],
    });
    expect(state.dialogue).toEqual({ npcId: "test:keeper", nodeId: "secret" });
    expect(events).toContainEqual({
      type: "reputation-changed",
      npcId: "test:keeper",
      factionId: "test:guild",
      npcStanding: 10,
      factionStanding: 10,
    });
  });

  it("insulting the keeper keeps the secret hidden", () => {
    const { state } = runScenario({
      world: fixtureWorld(),
      seed: 7,
      intents: [
        ...WALK_TO_KEEPER,
        { type: "talk" },
        { type: "choose", index: 1 }, // Insult (-10, ends)
        { type: "talk" },
        { type: "choose", index: 2 }, // now "Bye" — Secret? stays hidden
      ],
    });
    expect(state.dialogue).toBeNull();
    expect(state.deeds).toContainEqual({ deedId: "test:slight", npcId: "test:keeper", tick: 5 });
  });
});
