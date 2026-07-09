import { array, assert, constantFrom, property } from "fast-check";
import { describe, expect, it } from "vitest";
import { advance } from "./advance.ts";
import type { Intent } from "./intent.ts";
import { isBlocked } from "./map.ts";
import { createGameState, type GameState } from "./state.ts";
import { fixtureWorld } from "./world.fixture.ts";

const world = fixtureWorld();

function freshState(): GameState {
  return createGameState({ seed: 42, world });
}

function run(state: GameState, intents: readonly Intent[]): GameState {
  let current = state;
  for (const intent of intents) {
    current = advance(current, intent, world).state;
  }
  return current;
}

// Player (1,1) → (4,3), the tile above the keeper's nook.
const WALK_TO_KEEPER: readonly Intent[] = [
  { type: "move", direction: "south" },
  { type: "move", direction: "south" },
  { type: "move", direction: "east" },
  { type: "move", direction: "east" },
  { type: "move", direction: "east" },
];

describe("advance: move & wait", () => {
  it("moves the player into an open tile and ticks the clock", () => {
    const result = advance(freshState(), { type: "move", direction: "south" }, world);
    expect(result.state.player.pos).toEqual({ x: 1, y: 2 });
    expect(result.state.tick).toBe(1);
    expect(result.events).toEqual([
      { type: "player-moved", from: { x: 1, y: 1 }, to: { x: 1, y: 2 } },
    ]);
  });

  it("blocks movement into a wall, still ticking", () => {
    const result = advance(freshState(), { type: "move", direction: "north" }, world);
    expect(result.state.player.pos).toEqual({ x: 1, y: 1 });
    expect(result.state.tick).toBe(1);
    expect(result.events).toEqual([
      { type: "movement-blocked", at: { x: 1, y: 1 }, toward: { x: 1, y: 0 } },
    ]);
  });

  it("blocks movement into an NPC", () => {
    const atKeeperDoor = run(freshState(), WALK_TO_KEEPER);
    const result = advance(atKeeperDoor, { type: "move", direction: "south" }, world);
    expect(result.state.player.pos).toEqual({ x: 4, y: 3 });
    expect(result.events[0]?.type).toBe("movement-blocked");
  });

  it("wait advances time and lets NPCs act", () => {
    const state = run(
      freshState(),
      Array.from({ length: 10 }, () => ({ type: "wait" }) as const),
    );
    expect(state.tick).toBe(10);
    const walker = state.npcs.find((npc) => npc.id === "test:walker");
    expect(walker?.pos).toEqual({ x: 6, y: 2 });
  });

  it("does not mutate the input state", () => {
    const state = freshState();
    advance(state, { type: "move", direction: "south" }, world);
    expect(state.player.pos).toEqual({ x: 1, y: 1 });
    expect(state.tick).toBe(0);
  });
});

describe("advance: talk & choose", () => {
  it("talk with no adjacent NPC is rejected without ticking", () => {
    const result = advance(freshState(), { type: "talk" }, world);
    expect(result.state.tick).toBe(0);
    expect(result.events[0]?.type).toBe("intent-rejected");
  });

  it("talk next to an NPC opens their dialogue at the start node", () => {
    const result = advance(run(freshState(), WALK_TO_KEEPER), { type: "talk" }, world);
    expect(result.state.dialogue).toEqual({ npcId: "test:keeper", nodeId: "hello" });
    expect(result.state.tick).toBe(5);
    expect(result.events).toEqual([
      { type: "dialogue-started", npcId: "test:keeper", nodeId: "hello" },
    ]);
  });

  it("move and wait are rejected during dialogue", () => {
    const talking = advance(run(freshState(), WALK_TO_KEEPER), { type: "talk" }, world).state;
    for (const intent of [{ type: "move", direction: "north" }, { type: "wait" }] as const) {
      const result = advance(talking, intent, world);
      expect(result.state).toEqual(talking);
      expect(result.events[0]?.type).toBe("intent-rejected");
    }
  });

  it("choosing an effectful choice records the deed and reports reputation", () => {
    const talking = advance(run(freshState(), WALK_TO_KEEPER), { type: "talk" }, world).state;
    const result = advance(talking, { type: "choose", index: 0 }, world);
    expect(result.state.deeds).toEqual([
      { deedId: "test:praise", npcId: "test:keeper", tick: 5, knownBy: ["test:keeper"] },
    ]);
    expect(result.state.dialogue).toEqual({ npcId: "test:keeper", nodeId: "smile" });
    expect(result.events).toEqual([
      { type: "deed-recorded", deedId: "test:praise", npcId: "test:keeper" },
      {
        type: "reputation-changed",
        npcId: "test:keeper",
        factionId: "test:guild",
        npcStanding: 10,
        factionStanding: 10,
      },
      { type: "dialogue-advanced", npcId: "test:keeper", nodeId: "smile" },
    ]);
  });

  it("a choice without next ends the dialogue", () => {
    const talking = advance(run(freshState(), WALK_TO_KEEPER), { type: "talk" }, world).state;
    const result = advance(talking, { type: "choose", index: 2 }, world);
    expect(result.state.dialogue).toBeNull();
    expect(result.events).toEqual([{ type: "dialogue-ended", npcId: "test:keeper" }]);
  });

  it("choose indexes into the visible (condition-filtered) choices", () => {
    // With +10 standing the hidden "Secret?" choice appears at index 2.
    const praised = advance(run(freshState(), WALK_TO_KEEPER), { type: "talk" }, world).state;
    const smiled = advance(praised, { type: "choose", index: 0 }, world).state;
    const ended = advance(smiled, { type: "choose", index: 0 }, world).state;
    const again = advance(ended, { type: "talk" }, world).state;
    const result = advance(again, { type: "choose", index: 2 }, world);
    expect(result.state.dialogue).toEqual({ npcId: "test:keeper", nodeId: "secret" });
  });

  it("an out-of-range choice is rejected", () => {
    const talking = advance(run(freshState(), WALK_TO_KEEPER), { type: "talk" }, world).state;
    const result = advance(talking, { type: "choose", index: 9 }, world);
    expect(result.state).toEqual(talking);
    expect(result.events[0]?.type).toBe("intent-rejected");
  });

  it("choose outside dialogue is rejected", () => {
    const result = advance(freshState(), { type: "choose", index: 0 }, world);
    expect(result.events[0]?.type).toBe("intent-rejected");
  });
});

const arbitraryIntent = constantFrom<Intent>(
  { type: "move", direction: "north" },
  { type: "move", direction: "south" },
  { type: "move", direction: "east" },
  { type: "move", direction: "west" },
  { type: "wait" },
  { type: "talk" },
  { type: "choose", index: 0 },
  { type: "choose", index: 1 },
);

describe("advance: properties", () => {
  it("is deterministic for any intent sequence", () => {
    assert(
      property(array(arbitraryIntent, { maxLength: 200 }), (intents) => {
        expect(JSON.stringify(run(freshState(), intents))).toBe(
          JSON.stringify(run(freshState(), intents)),
        );
      }),
    );
  });

  it("never places the player or an NPC on a blocked tile, never overlaps entities", () => {
    assert(
      property(array(arbitraryIntent, { maxLength: 200 }), (intents) => {
        let state = freshState();
        for (const intent of intents) {
          state = advance(state, intent, world).state;
          const tiles = [state.player.pos, ...state.npcs.map((npc) => npc.pos)];
          for (const pos of tiles) {
            expect(isBlocked(world.map, pos.x, pos.y)).toBe(false);
          }
          expect(new Set(tiles.map((pos) => `${pos.x},${pos.y}`)).size).toBe(tiles.length);
        }
      }),
    );
  });
});

describe("advance: sneak", () => {
  it("toggles sneaking without spending time", () => {
    const result = advance(freshState(), { type: "sneak" }, world);
    expect(result.state.player.sneaking).toBe(true);
    expect(result.state.tick).toBe(0);
    expect(result.events).toEqual([{ type: "sneak-toggled", sneaking: true }]);
  });

  it("toggles back off", () => {
    const sneaking = advance(freshState(), { type: "sneak" }, world).state;
    const result = advance(sneaking, { type: "sneak" }, world);
    expect(result.state.player.sneaking).toBe(false);
  });

  it("makes movement cost two ticks", () => {
    const sneaking = advance(freshState(), { type: "sneak" }, world).state;
    const result = advance(sneaking, { type: "move", direction: "south" }, world);
    expect(result.state.tick).toBe(2);
    expect(result.state.player.pos).toEqual({ x: 1, y: 2 });
  });

  it("is rejected mid-conversation", () => {
    const inDialogue = { ...freshState(), dialogue: { npcId: "test:keeper", nodeId: "hello" } };
    const result = advance(inDialogue, { type: "sneak" }, world);
    expect(result.state.player.sneaking).toBe(false);
    expect(result.events[0]?.type).toBe("intent-rejected");
  });
});
