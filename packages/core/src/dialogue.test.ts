import { describe, expect, it } from "vitest";
import { currentNode, visibleChoices } from "./dialogue.ts";
import { createGameState, type GameState } from "./state.ts";
import { fixtureWorld } from "./world.fixture.ts";

const world = fixtureWorld();

function inDialogue(deeds: GameState["deeds"]): GameState {
  return {
    ...createGameState({ seed: 1, world }),
    dialogue: { npcId: "test:keeper", nodeId: "hello" },
    deeds,
  };
}

describe("currentNode", () => {
  it("returns undefined outside dialogue", () => {
    expect(currentNode(createGameState({ seed: 1, world }), world)).toBeUndefined();
  });

  it("returns the active node", () => {
    expect(currentNode(inDialogue([]), world)?.text).toBe("What'll it be?");
  });
});

describe("visibleChoices", () => {
  it("hides choices whose condition fails", () => {
    const texts = visibleChoices(inDialogue([]), world).map((choice) => choice.text);
    expect(texts).toEqual(["Compliment", "Insult", "Bye"]);
  });

  it("reveals choices once standing qualifies", () => {
    const state = inDialogue([{ deedId: "test:praise", npcId: "test:keeper", tick: 1 }]);
    const texts = visibleChoices(state, world).map((choice) => choice.text);
    expect(texts).toEqual(["Compliment", "Insult", "Secret?", "Bye"]);
  });

  it("returns no choices outside dialogue", () => {
    expect(visibleChoices(createGameState({ seed: 1, world }), world)).toEqual([]);
  });
});
