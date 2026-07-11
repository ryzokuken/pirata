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
    expect(texts).toEqual(["Compliment", "Insult", "Bye", "Any whispers?"]);
  });

  it("reveals choices once standing qualifies", () => {
    const state = inDialogue([
      { deedId: "test:praise", npcId: "test:keeper", tick: 1, knownBy: ["test:keeper"] },
    ]);
    const texts = visibleChoices(state, world).map((choice) => choice.text);
    expect(texts).toEqual(["Compliment", "Insult", "Secret?", "Bye", "Any whispers?"]);
  });

  it("returns no choices outside dialogue", () => {
    expect(visibleChoices(createGameState({ seed: 1, world }), world)).toEqual([]);
  });
});

describe("coin-at-least condition", () => {
  it("hides the fine choice until the player can pay", () => {
    const broke = {
      ...createGameState({ seed: 1, world }),
      player: { ...createGameState({ seed: 1, world }).player, coin: 5 },
      dialogue: { npcId: "test:guard", nodeId: "halt" },
    };
    expect(visibleChoices(broke, world).map((choice) => choice.text)).toEqual([
      "I owe you nothing",
    ]);
    const solvent = { ...broke, player: { ...broke.player, coin: 20 } };
    expect(visibleChoices(solvent, world).map((choice) => choice.text)).toEqual([
      "Pay 20 coin",
      "I owe you nothing",
    ]);
  });
});
