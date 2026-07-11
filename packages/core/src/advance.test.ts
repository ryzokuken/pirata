import { array, assert, constantFrom, property } from "fast-check";
import { describe, expect, it } from "vitest";
import { advance } from "./advance.ts";
import type { GameEvent } from "./event.ts";
import { runScenario } from "./harness.ts";
import { HUNGER_MAX } from "./hunger.ts";
import type { Intent } from "./intent.ts";
import { isBlocked } from "./map.ts";
import { factionStanding, npcStanding } from "./reputation.ts";
import { createGameState, PLAYER_COMBAT, type GameState } from "./state.ts";
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

// Player (1,1) → (6,3): S,S,E,E,E,E,E — the last east step lands on the portal.
const WALK_TO_PORTAL: readonly Intent[] = [
  { type: "move", direction: "south" },
  { type: "move", direction: "south" },
  ...Array.from({ length: 5 }, (): Intent => ({ type: "move", direction: "east" })),
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

describe("advance: portals", () => {
  it("stepping onto a portal moves the player to the target map location", () => {
    const result = run(freshState(), WALK_TO_PORTAL);
    expect(result.mapId).toBe("lair");
    expect(result.player.pos).toEqual({ x: 3, y: 3 });
  });

  it("emits map-changed and still costs a tick", () => {
    const before = run(freshState(), WALK_TO_PORTAL.slice(0, -1));
    const result = advance(before, { type: "move", direction: "east" }, world);
    expect(result.events).toContainEqual({
      type: "map-changed",
      fromMapId: "town",
      toMapId: "lair",
      at: { x: 3, y: 3 },
    });
    expect(result.state.tick).toBe(before.tick + 1);
  });

  it("keeps working in both directions", () => {
    const inLair = run(freshState(), WALK_TO_PORTAL);
    // (3,3) → portal (5,3): E,E
    const back = run(inLair, [
      { type: "move", direction: "east" },
      { type: "move", direction: "east" },
    ]);
    expect(back.mapId).toBe("town");
    expect(back.player.pos).toEqual({ x: 1, y: 3 });
  });

  it("is blocked when an NPC stands on the arrival tile", () => {
    const before = run(freshState(), WALK_TO_PORTAL.slice(0, -1));
    const blocked = {
      ...before,
      npcs: before.npcs.map((npc) =>
        npc.id === "test:brute" ? { ...npc, pos: { x: 3, y: 3 } } : npc,
      ),
    };
    const result = advance(blocked, { type: "move", direction: "east" }, world);
    expect(result.state.mapId).toBe("town");
    expect(result.events[0]?.type).toBe("movement-blocked");
  });
});

describe("advance: aggro and combat start", () => {
  it("alerts a hostile that spots the player, then starts combat once adjacent", () => {
    const before = run(freshState(), WALK_TO_PORTAL.slice(0, -1));
    const arrived = advance(before, { type: "move", direction: "east" }, world);
    const arrivedBrute = arrived.state.npcs.find((npc) => npc.id === "test:brute");
    expect(arrivedBrute?.alert).toBe(true);
    expect(arrived.events).toContainEqual({ type: "npc-alerted", npcId: "test:brute" });
    expect(arrived.state.combat).toBeNull();

    const chased = advance(arrived.state, { type: "wait" }, world);
    const chasedBrute = chased.state.npcs.find((npc) => npc.id === "test:brute");
    expect(chasedBrute?.pos).toEqual({ x: 3, y: 2 });
    expect(chased.events).toContainEqual({
      type: "combat-started",
      enemyIds: ["test:brute"],
    });
    expect(chased.state.combat).toEqual({ enemyIds: ["test:brute"] });
  });

  it("does not re-trigger combat-started while combat is already active", () => {
    const arrived = run(freshState(), WALK_TO_PORTAL);
    const started = advance(arrived, { type: "wait" }, world).state;
    expect(started.combat).toEqual({ enemyIds: ["test:brute"] });

    const again = advance(started, { type: "wait" }, world);
    expect(again.events.some((event) => event.type === "combat-started")).toBe(false);
  });

  it("calms an alerted hostile once the player leaves its map", () => {
    const before = run(freshState(), WALK_TO_PORTAL.slice(0, -1));
    const arrived = advance(before, { type: "move", direction: "east" }, world).state;
    const backInTown: GameState = {
      ...arrived,
      mapId: "town",
      player: { ...arrived.player, pos: { x: 1, y: 3 } },
    };
    const result = advance(backInTown, { type: "wait" }, world);
    const brute = result.state.npcs.find((npc) => npc.id === "test:brute");
    expect(brute?.alert).toBeUndefined();
    expect(result.events).toContainEqual({ type: "npc-calmed", npcId: "test:brute" });
  });

  it("does not alert while sneaking at night, outside the shorter radius", () => {
    const fresh = freshState();
    const nightSneaking: GameState = {
      ...fresh,
      tick: 129,
      mapId: "lair",
      player: { ...fresh.player, pos: { x: 3, y: 3 }, sneaking: true },
    };
    const result = advance(nightSneaking, { type: "wait" }, world);
    const brute = result.state.npcs.find((npc) => npc.id === "test:brute");
    expect(brute?.alert).toBeUndefined();
    expect(result.events.some((event) => event.type === "npc-alerted")).toBe(false);
  });
});

describe("advance: combat rounds", () => {
  // Walks through the lair portal then waits once: the brute chases adjacent
  // and combat-started fires (mirrors "advance: aggro and combat start").
  // Player ends at (3,3), brute at (3,2) — no rng consumed getting here.
  function combatState(seed: number): GameState {
    const arrived = run(createGameState({ seed, world }), WALK_TO_PORTAL);
    return advance(arrived, { type: "wait" }, world).state;
  }

  it("rejects other world intents while a fight is on", () => {
    const state = combatState(1);
    const blocked: Intent[] = [
      { type: "move", direction: "north" },
      { type: "wait" },
      { type: "talk" },
      { type: "take" },
      { type: "trade" },
      { type: "sneak" },
      { type: "eat", index: 0 },
      { type: "pickpocket" },
    ];
    for (const intent of blocked) {
      const result = advance(state, intent, world);
      expect(result.events).toEqual([
        { type: "intent-rejected", reason: "not in the middle of a fight" },
      ]);
      expect(result.state).toEqual(state);
    }
  });

  it("rejects attack and flee when there is no fight", () => {
    const fresh = freshState();
    expect(advance(fresh, { type: "attack", index: 0 }, world).events).toEqual([
      { type: "intent-rejected", reason: "there is no fight" },
    ]);
    expect(advance(fresh, { type: "flee", direction: "north" }, world).events).toEqual([
      { type: "intent-rejected", reason: "there is no fight" },
    ]);
  });

  it("resolves the player's attack deterministically and does not advance the tick", () => {
    const state = combatState(1);
    const result = advance(state, { type: "attack", index: 0 }, world);
    expect(["attack-hit", "attack-missed"]).toContain(result.events[0]?.type);
    expect(result.state.tick).toBe(state.tick);
    expect(advance(state, { type: "attack", index: 0 }, world)).toEqual(result);
  });

  it("the brute retaliates when it survives the player's attack and stays adjacent", () => {
    for (let seed = 1; seed < 50; seed += 1) {
      const state = combatState(seed);
      const result = advance(state, { type: "attack", index: 0 }, world);
      const brute = result.state.npcs.find((npc) => npc.id === "test:brute");
      if (brute !== undefined && (brute.hp ?? 0) > 0) {
        expect(
          result.events.some(
            (event) =>
              (event.type === "attack-hit" || event.type === "attack-missed") &&
              event.attackerId === "test:brute" &&
              event.targetId === "player",
          ),
        ).toBe(true);
        return;
      }
    }
    expect.unreachable("the brute never survived a player attack in 50 seeds");
  });

  it("kills the brute, drops its pockets, and ends combat in victory", () => {
    for (let seed = 1; seed < 200; seed += 1) {
      let result = advance(combatState(seed), { type: "attack", index: 0 }, world);
      let rounds = 0;
      while (result.state.combat !== null && rounds < 20) {
        result = advance(result.state, { type: "attack", index: 0 }, world);
        rounds += 1;
      }
      const bruteGone = !result.state.npcs.some((npc) => npc.id === "test:brute");
      if (result.state.combat === null && bruteGone) {
        expect(result.events).toContainEqual({ type: "npc-died", npcId: "test:brute" });
        expect(result.events).toContainEqual({ type: "combat-ended", outcome: "victory" });
        expect(result.state.worldItems).toContainEqual({
          mapId: "lair",
          itemId: "test:trinket",
          pos: { x: 3, y: 2 },
        });
        return;
      }
    }
    expect.unreachable("the brute never died within the round budget across seeds");
  });

  it("flee resolves the brute's opportunity attack before the player's step", () => {
    const state = combatState(3);
    const result = advance(state, { type: "flee", direction: "west" }, world);
    expect(["attack-hit", "attack-missed"]).toContain(result.events[0]?.type);
    expect(result.events[0]).toMatchObject({ attackerId: "test:brute", targetId: "player" });
    expect(result.state.tick).toBe(state.tick);
  });

  it("wastes the round when the flee step is blocked", () => {
    const state = combatState(5);
    const result = advance(state, { type: "flee", direction: "south" }, world);
    expect(result.state.player.pos).toEqual({ x: 3, y: 3 });
    expect(result.events).toContainEqual({
      type: "movement-blocked",
      at: { x: 3, y: 3 },
      toward: { x: 3, y: 4 },
    });
    expect(result.state.tick).toBe(state.tick);
  });

  it("ends combat 'fled' once no enemy remains within disengage range, keeping it alert", () => {
    // Opposite corners of the lair's open room (Chebyshev distance 4): the
    // brute's one chase step and the player's one (blocked) flee step still
    // leave them 3 apart, clearing DISENGAGE_RANGE (2) with no rng involved.
    const fresh = freshState();
    const state: GameState = {
      ...fresh,
      mapId: "lair",
      combat: { enemyIds: ["test:brute"] },
      player: { ...fresh.player, pos: { x: 5, y: 3 } },
      npcs: fresh.npcs.map((npc) =>
        npc.id === "test:brute" ? { ...npc, pos: { x: 1, y: 1 }, alert: true } : npc,
      ),
    };
    const result = advance(state, { type: "flee", direction: "east" }, world);
    expect(result.events).toContainEqual({
      type: "movement-blocked",
      at: { x: 5, y: 3 },
      toward: { x: 6, y: 3 },
    });
    expect(result.state.combat).toBeNull();
    expect(result.events).toContainEqual({ type: "combat-ended", outcome: "fled" });
    const brute = result.state.npcs.find((npc) => npc.id === "test:brute");
    expect(brute?.pos).toEqual({ x: 2, y: 1 });
    expect(brute?.alert).toBe(true);
    expect(result.state.tick).toBe(state.tick);
  });
});

describe("advance: defeat (robbed, not dead)", () => {
  // Same arrival as "advance: combat rounds", but the player's hp is forced
  // to 1 so that any hit the brute lands is a killing blow.
  function overwhelmed(seed: number): GameState {
    const arrived = run(createGameState({ seed, world }), WALK_TO_PORTAL);
    const chased = advance(arrived, { type: "wait" }, world).state;
    return { ...chased, player: { ...chased.player, hp: 1 } };
  }

  it("resets the player and calms the brute once hp reaches 0, leaving the world otherwise intact", () => {
    for (let seed = 1; seed < 200; seed += 1) {
      const before = overwhelmed(seed);
      const result = advance(before, { type: "attack", index: 0 }, world);
      const defeated = result.events.some((event) => event.type === "player-defeated");
      if (defeated) {
        expect(result.state.mapId).toBe(world.startMapId);
        expect(result.state.player.pos).toEqual(world.maps[world.startMapId]?.playerSpawn);
        expect(result.state.player.coin).toBe(0);
        expect(result.state.player.items).toEqual([]);
        expect(result.state.player.hp).toBe(PLAYER_COMBAT.maxHp);
        expect(result.state.player.sneaking).toBe(false);
        expect(result.state.combat).toBeNull();
        expect(result.state.deeds).toEqual(before.deeds);
        expect(result.state.rumors).toEqual(before.rumors);
        expect(result.state.worldItems).toEqual(before.worldItems);
        const brute = result.state.npcs.find((npc) => npc.id === "test:brute");
        expect(brute).toBeDefined();
        expect(brute?.alert).toBeUndefined();
        expect(brute?.hp).toBeGreaterThan(0);
        expect(result.state.tick).toBe(before.tick);
        return;
      }
    }
    expect.unreachable("the brute never landed a killing blow on hp 1 across 200 seeds");
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

describe("advance: rumors", () => {
  it("choosing a rumor effect appends it to state.rumors and emits rumor-heard", () => {
    const talking = advance(run(freshState(), WALK_TO_KEEPER), { type: "talk" }, world).state;
    const result = advance(talking, { type: "choose", index: 3 }, world);
    expect(result.state.rumors).toEqual(["test:whisper"]);
    expect(result.events).toEqual([
      { type: "rumor-heard", rumorId: "test:whisper" },
      { type: "dialogue-ended", npcId: "test:keeper" },
    ]);
  });

  it("hearing the same rumor twice does not duplicate it or emit again", () => {
    const talking = advance(run(freshState(), WALK_TO_KEEPER), { type: "talk" }, world).state;
    const heard = advance(talking, { type: "choose", index: 3 }, world).state;
    const talkingAgain = advance(heard, { type: "talk" }, world).state;
    const result = advance(talkingAgain, { type: "choose", index: 3 }, world);
    expect(result.state.rumors).toEqual(["test:whisper"]);
    expect(result.events).toEqual([{ type: "dialogue-ended", npcId: "test:keeper" }]);
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
  { type: "sneak" },
  { type: "take" },
  { type: "pickpocket" },
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
          // Same-map only: cross-map NPCs may legitimately share raw coordinates.
          const sameMapNpcs = state.npcs.filter((npc) => npc.mapId === state.mapId);
          const tiles = [state.player.pos, ...sameMapNpcs.map((npc) => npc.pos)];
          for (const pos of tiles) {
            expect(isBlocked(world.maps[state.mapId]!, pos.x, pos.y)).toBe(false);
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

// Player (1,1) → the trinket tile (3,3).
const WALK_TO_TRINKET: readonly Intent[] = [
  { type: "move", direction: "south" },
  { type: "move", direction: "south" },
  { type: "move", direction: "east" },
  { type: "move", direction: "east" },
];

describe("advance: take (theft)", () => {
  it("picks up the item underfoot; the keeper witnesses", () => {
    const atTrinket = run(freshState(), WALK_TO_TRINKET);
    const result = advance(atTrinket, { type: "take" }, world);
    expect(result.state.player.items).toEqual(["test:trinket"]);
    expect(result.state.worldItems).toEqual([
      { mapId: "lair", itemId: "test:loot", pos: { x: 2, y: 1 } },
    ]);
    expect(result.state.deeds).toEqual([
      { deedId: "test:theft", tick: 4, knownBy: ["test:keeper"] },
    ]);
    expect(result.state.tick).toBe(5);
    expect(result.events).toContainEqual({
      type: "item-taken",
      itemId: "test:trinket",
      at: { x: 3, y: 3 },
    });
    expect(result.events).toContainEqual({
      type: "crime-witnessed",
      deedId: "test:theft",
      witnessIds: ["test:keeper"],
    });
  });

  it("drops standing with everyone who knows", () => {
    const atTrinket = run(freshState(), WALK_TO_TRINKET);
    const result = advance(atTrinket, { type: "take" }, world);
    expect(npcStanding(result.state, world, "test:keeper")).toBe(-20);
    expect(factionStanding(result.state, world, "test:guild")).toBe(-20);
    expect(factionStanding(result.state, world, "test:watch")).toBe(0);
  });

  it("rejects taking where there is nothing", () => {
    const result = advance(freshState(), { type: "take" }, world);
    expect(result.events).toEqual([
      { type: "intent-rejected", reason: "there is nothing here to take" },
    ]);
    expect(result.state.tick).toBe(0);
  });

  it("ignores an item on another map at the same raw coordinates", () => {
    const atTrinket = run(freshState(), WALK_TO_TRINKET);
    // Replace the town trinket with a decoy on the lair map at the same
    // (3,3) coordinates: the player, standing on the town map, must not be
    // able to take it.
    const decoy: GameState = {
      ...atTrinket,
      worldItems: [{ mapId: "lair", itemId: "test:loot", pos: { x: 3, y: 3 } }],
    };
    const result = advance(decoy, { type: "take" }, world);
    expect(result.state.player.items).toEqual([]);
    expect(result.events).toEqual([
      { type: "intent-rejected", reason: "there is nothing here to take" },
    ]);
  });

  it("rejects the verb when the world defines no theft crime", () => {
    const lawless = { ...world, crimes: {} };
    const atTrinket = run(createGameState({ seed: 42, world: lawless }), WALK_TO_TRINKET);
    const result = advance(atTrinket, { type: "take" }, lawless);
    expect(result.events[0]?.type).toBe("intent-rejected");
    expect(result.state.worldItems).toHaveLength(2);
  });
});

describe("advance: pickpocket", () => {
  function attempt(seed: number) {
    const atKeeper = run(createGameState({ seed, world }), WALK_TO_KEEPER);
    return advance(atKeeper, { type: "pickpocket" }, world);
  }

  it("records the crime deed whatever the outcome, and time passes", () => {
    const result = attempt(1);
    expect(result.state.deeds).toHaveLength(1);
    expect(result.state.deeds[0]?.deedId).toBe("test:pickpocketing");
    expect(result.state.tick).toBe(6);
    expect(result.state.rng).not.toBe(createGameState({ seed: 1, world }).rng);
  });

  it("on success the pearl moves and the victim does not know", () => {
    for (let seed = 1; seed < 50; seed += 1) {
      const result = attempt(seed);
      if (result.state.player.items.includes("test:pearl")) {
        expect(result.state.npcs.find((npc) => npc.id === "test:keeper")?.pockets).toEqual([]);
        expect(result.state.deeds[0]?.knownBy).toEqual([]);
        expect(result.events).toContainEqual({
          type: "pickpocket-succeeded",
          npcId: "test:keeper",
          itemId: "test:pearl",
        });
        return;
      }
    }
    expect.unreachable("no successful pickpocket in 50 seeds");
  });

  it("on failure the victim knows and keeps the pearl", () => {
    for (let seed = 1; seed < 50; seed += 1) {
      const result = attempt(seed);
      if (!result.state.player.items.includes("test:pearl")) {
        expect(result.state.npcs.find((npc) => npc.id === "test:keeper")?.pockets).toEqual([
          "test:pearl",
        ]);
        expect(result.state.deeds[0]?.knownBy).toContain("test:keeper");
        expect(result.events).toContainEqual({
          type: "pickpocket-failed",
          npcId: "test:keeper",
        });
        return;
      }
    }
    expect.unreachable("no failed pickpocket in 50 seeds");
  });

  it("is deterministic for a given seed", () => {
    expect(attempt(7).state).toEqual(attempt(7).state);
  });

  it("rejects empty pockets without spending time or rng", () => {
    const state = run(freshState(), [
      { type: "move", direction: "east" },
      { type: "move", direction: "east" },
      { type: "move", direction: "east" },
    ]); // (4,1) is the guard's tile; player ends at (3,1), guard adjacent east — pockets empty
    const result = advance(state, { type: "pickpocket" }, world);
    expect(result.events[0]?.type).toBe("intent-rejected");
    expect(result.state.tick).toBe(state.tick);
  });
});

describe("gossip carries consequences across factions", () => {
  it("the walker learns of the theft while passing the keeper", () => {
    const intents: Intent[] = [
      ...WALK_TO_TRINKET,
      { type: "take" },
      { type: "move", direction: "west" },
      { type: "move", direction: "west" },
      { type: "move", direction: "north" },
      { type: "move", direction: "north" },
      ...Array.from({ length: 15 }, (): Intent => ({ type: "wait" })),
    ];
    const { state } = runScenario({ world, seed: 3, intents });
    const theft = state.deeds.find((deed) => deed.deedId === "test:theft");
    expect(theft?.knownBy).toContain("test:walker");
    expect(factionStanding(state, world, "test:dockers")).toBe(-20);
  });
});

describe("guard confrontation and fines", () => {
  function hostileToGuard(): GameState {
    const fresh = freshState();
    return {
      ...fresh,
      deeds: [{ deedId: "test:theft", tick: 0, knownBy: ["test:guard"] }],
    };
  }

  it("the guard forces dialogue when adjacent and they know", () => {
    // (3,1) is adjacent to the guard at (4,1).
    const result = run(hostileToGuard(), [
      { type: "move", direction: "east" },
      { type: "move", direction: "east" },
    ]);
    expect(result.dialogue).toEqual({ npcId: "test:guard", nodeId: "halt" });
  });

  it("does not confront when the guard knows nothing", () => {
    const result = run(freshState(), [
      { type: "move", direction: "east" },
      { type: "move", direction: "east" },
    ]);
    expect(result.dialogue).toBeNull();
  });

  it("paying the fine costs coin and squares you with the guard", () => {
    const confronted = run(hostileToGuard(), [
      { type: "move", direction: "east" },
      { type: "move", direction: "east" },
    ]);
    const result = advance(confronted, { type: "choose", index: 0 }, world);
    expect(result.state.player.coin).toBe(0);
    expect(result.state.dialogue).toBeNull();
    expect(npcStanding(result.state, world, "test:guard")).toBe(5);
    expect(result.events).toContainEqual({ type: "coin-paid", amount: 20, npcId: "test:guard" });
  });

  it("after paying, walking beside the guard is safe again", () => {
    const confronted = run(hostileToGuard(), [
      { type: "move", direction: "east" },
      { type: "move", direction: "east" },
    ]);
    const paid = advance(confronted, { type: "choose", index: 0 }, world).state;
    const result = advance(paid, { type: "wait" }, world);
    expect(result.state.dialogue).toBeNull();
  });

  it("a choice whose pay exceeds coin is rejected atomically", () => {
    const confronted = run(hostileToGuard(), [
      { type: "move", direction: "east" },
      { type: "move", direction: "east" },
    ]);
    const broke = { ...confronted, player: { ...confronted.player, coin: 20 } };
    // Manufacture a state where the visible choice demands more than we have:
    const poorer = { ...broke, player: { ...broke.player, coin: 0 } };
    const result = advance(poorer, { type: "choose", index: 0 }, world);
    // coin 0 hides "Pay 20 coin"; index 0 is now "I owe you nothing" — deed lands, no pay
    expect(result.state.player.coin).toBe(0);
    expect(result.state.deeds.some((deed) => deed.deedId === "test:defied")).toBe(true);
  });

  it("does not confront across maps, even when adjacent by raw coordinates", () => {
    const hostile = hostileToGuard();
    const guardElsewhere: GameState = {
      ...hostile,
      npcs: hostile.npcs.map((npc) => (npc.id === "test:guard" ? { ...npc, mapId: "lair" } : npc)),
    };
    const result = run(guardElsewhere, [
      { type: "move", direction: "east" },
      { type: "move", direction: "east" },
    ]);
    expect(result.dialogue).toBeNull();
  });
});

describe("advance: trade", () => {
  // (4,3) is adjacent to the keeper, who runs the fixture shop.
  function trading(): GameState {
    const atKeeper = run(freshState(), WALK_TO_KEEPER);
    return advance(atKeeper, { type: "trade" }, world).state;
  }

  it("opens and closes trade with the adjacent shopkeeper, costing no time", () => {
    const atKeeper = run(freshState(), WALK_TO_KEEPER);
    const opened = advance(atKeeper, { type: "trade" }, world);
    expect(opened.state.trade).toEqual({ npcId: "test:keeper" });
    expect(opened.state.tick).toBe(atKeeper.tick);
    expect(opened.events).toEqual([{ type: "trade-started", npcId: "test:keeper" }]);
    const closed = advance(opened.state, { type: "close-trade" }, world);
    expect(closed.state.trade).toBeNull();
    expect(closed.events).toEqual([{ type: "trade-ended", npcId: "test:keeper" }]);
  });

  it("buys from stock: coin down, item gained", () => {
    const result = advance(trading(), { type: "buy", index: 0 }, world);
    expect(result.state.player.coin).toBe(10);
    expect(result.state.player.items).toEqual(["test:trinket"]);
    expect(result.events).toContainEqual({
      type: "item-bought",
      itemId: "test:trinket",
      price: 10,
    });
  });

  it("sells from the bag: item gone, coin up", () => {
    const bought = advance(trading(), { type: "buy", index: 0 }, world).state;
    const result = advance(bought, { type: "sell", index: 0 }, world);
    expect(result.state.player.items).toEqual([]);
    expect(result.state.player.coin).toBe(15);
    expect(result.events).toContainEqual({
      type: "item-sold",
      itemId: "test:trinket",
      price: 5,
    });
  });

  it("rejects buying beyond your purse", () => {
    const broke = { ...trading(), player: { ...trading().player, coin: 3 } };
    const result = advance(broke, { type: "buy", index: 0 }, world);
    expect(result.events[0]?.type).toBe("intent-rejected");
    expect(result.state.player.items).toEqual([]);
  });

  it("a hostile shopkeeper refuses to open trade at all", () => {
    const atKeeper = run(freshState(), WALK_TO_KEEPER);
    const hated = {
      ...atKeeper,
      deeds: [{ deedId: "test:theft", tick: 0, knownBy: ["test:keeper"] }],
    };
    const result = advance(hated, { type: "trade" }, world);
    expect(result.state.trade).toBeNull();
    expect(result.events[0]?.type).toBe("intent-rejected");
  });

  it("rejects trading with someone who keeps no shop", () => {
    const atGuard = run(freshState(), [
      { type: "move", direction: "east" },
      { type: "move", direction: "east" },
    ]);
    const result = advance(atGuard, { type: "trade" }, world);
    expect(result.events[0]?.type).toBe("intent-rejected");
  });

  it("movement is rejected while trading", () => {
    const result = advance(trading(), { type: "move", direction: "north" }, world);
    expect(result.events[0]?.type).toBe("intent-rejected");
    expect(result.state.tick).toBe(trading().tick);
  });
});

function withHunger(hunger: number, hp: number = PLAYER_COMBAT.maxHp): GameState {
  return { ...freshState(), player: { ...freshState().player, hunger, hp } };
}

describe("advance: hunger", () => {
  it("accrues one hunger point every 10 ticks", () => {
    let state = freshState();
    for (let i = 0; i < 10; i += 1) {
      state = advance(state, { type: "wait" }, world).state;
    }
    expect(state.player.hunger).toBe(1);
  });

  it("does not fire hunger-changed while the stage is unchanged", () => {
    let state = freshState();
    let events: GameEvent[] = [];
    for (let i = 0; i < 10; i += 1) {
      const result = advance(state, { type: "wait" }, world);
      state = result.state;
      events = [...events, ...result.events];
    }
    expect(events.some((event) => event.type === "hunger-changed")).toBe(false);
  });

  it("crossing into starving fires hunger-changed and costs 1 hp", () => {
    let state = withHunger(23, 5);
    let events: GameEvent[] = [];
    for (let i = 0; i < 10; i += 1) {
      const result = advance(state, { type: "wait" }, world);
      state = result.state;
      events = [...events, ...result.events];
    }
    expect(state.player.hunger).toBe(24);
    expect(state.player.hp).toBe(4);
    expect(events).toContainEqual({ type: "hunger-changed", stage: "starving" });
  });

  it("hp never drops below 1 from starvation", () => {
    let state = withHunger(24, 1);
    for (let i = 0; i < 10; i += 1) {
      state = advance(state, { type: "wait" }, world).state;
    }
    expect(state.player.hunger).toBe(25);
    expect(state.player.hp).toBe(1);
  });

  it("hunger clamps at HUNGER_MAX", () => {
    let state = withHunger(HUNGER_MAX, 5);
    for (let i = 0; i < 10; i += 1) {
      state = advance(state, { type: "wait" }, world).state;
    }
    expect(state.player.hunger).toBe(HUNGER_MAX);
  });
});

function withFood(state: GameState, hunger: number = 20): GameState {
  return { ...state, player: { ...state.player, items: ["test:trinket"], hunger } };
}

describe("advance: eat", () => {
  it("eating a food item reduces hunger, costs a tick, and emits ate-food", () => {
    const result = advance(withFood(freshState()), { type: "eat", index: 0 }, world);
    expect(result.state.player.items).toEqual([]);
    expect(result.state.player.hunger).toBe(12);
    expect(result.state.tick).toBe(1);
    expect(result.events).toContainEqual({ type: "ate-food", itemId: "test:trinket" });
  });

  it("hunger does not go below 0", () => {
    const result = advance(withFood(freshState(), 3), { type: "eat", index: 0 }, world);
    expect(result.state.player.hunger).toBe(0);
  });

  it("rejects eating an item with no food def", () => {
    const carrying = { ...freshState(), player: { ...freshState().player, items: ["test:pearl"] } };
    const result = advance(carrying, { type: "eat", index: 0 }, world);
    expect(result.events).toEqual([{ type: "intent-rejected", reason: "you cannot eat that" }]);
    expect(result.state.player.items).toEqual(["test:pearl"]);
  });

  it("rejects eating at an empty index", () => {
    const result = advance(freshState(), { type: "eat", index: 0 }, world);
    expect(result.events).toEqual([{ type: "intent-rejected", reason: "you cannot eat that" }]);
  });

  it("rejects eating while in dialogue", () => {
    const talking = advance(run(freshState(), WALK_TO_KEEPER), { type: "talk" }, world).state;
    const result = advance(withFood(talking), { type: "eat", index: 0 }, world);
    expect(result.events[0]?.type).toBe("intent-rejected");
  });

  it("rejects eating while trading", () => {
    const atKeeper = run(freshState(), WALK_TO_KEEPER);
    const tradingState = advance(atKeeper, { type: "trade" }, world).state;
    const result = advance(withFood(tradingState), { type: "eat", index: 0 }, world);
    expect(result.events[0]?.type).toBe("intent-rejected");
  });

  it("rejects eating in combat", () => {
    const inCombat: GameState = { ...freshState(), combat: { enemyIds: ["test:brute"] } };
    const result = advance(withFood(inCombat), { type: "eat", index: 0 }, world);
    expect(result.events[0]?.type).toBe("intent-rejected");
  });
});
