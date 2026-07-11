import type { WorldDef } from "./defs.ts";
import type { MapModel } from "./map.ts";
import type { Vec2 } from "./state.ts";

/**
 * Builds a MapModel from ASCII art for tests.
 * Legend: '#' wall, '.' floor, 'P' player spawn, any lowercase letter a
 * walkable named location (the letter is the location name), digits '1'-'9'
 * a walkable tile carrying an item named by `itemLegend`.
 */
export function mapFromAscii(
  rows: readonly string[],
  itemLegend: Readonly<Record<string, string>> = {},
): MapModel {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const blocked: boolean[] = [];
  const locations: Record<string, Vec2> = {};
  const items: { itemId: string; pos: Vec2 }[] = [];
  let spawn = { x: 1, y: 1 };
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      blocked.push(ch === "#");
      if (ch === "P") {
        spawn = { x, y };
      }
      if (ch >= "a" && ch <= "z") {
        locations[ch] = { x, y };
      }
      const itemId = itemLegend[ch];
      if (ch >= "1" && ch <= "9" && itemId !== undefined) {
        items.push({ itemId, pos: { x, y } });
      }
    });
  });
  return {
    id: "fixture",
    width,
    height,
    blocked,
    playerSpawn: spawn,
    locations,
    items,
    portals: [],
  };
}

export const FIXTURE_MAP = mapFromAscii(
  ["########", "#P..g.a#", "#.####.#", "#b.1...#", "####t###", "########"],
  { "1": "test:trinket" },
);

export function fixtureWorld(): WorldDef {
  return {
    // Task 2 replaces this with the real second-map fixture (town + lair).
    maps: { fixture: FIXTURE_MAP },
    startMapId: "fixture",
    rumors: {},
    factions: {
      "test:guild": { id: "test:guild", name: "The Guild" },
      "test:dockers": { id: "test:dockers", name: "The Dockers" },
      "test:watch": { id: "test:watch", name: "The Watch" },
    },
    items: {
      "test:trinket": { id: "test:trinket", name: "Brass trinket", value: 10 },
      "test:pearl": { id: "test:pearl", name: "Pearl", value: 15 },
    },
    crimes: { pickpocket: "test:pickpocketing", theft: "test:theft" },
    deeds: {
      "test:praise": { id: "test:praise", name: "Praise", standingDelta: 10 },
      "test:slight": { id: "test:slight", name: "Slight", standingDelta: -10 },
      "test:pickpocketing": { id: "test:pickpocketing", name: "Pickpocketing", standingDelta: -15 },
      "test:theft": { id: "test:theft", name: "Theft", standingDelta: -20 },
      "test:paid_fine": { id: "test:paid_fine", name: "Paid a fine", standingDelta: 25 },
      "test:defied": { id: "test:defied", name: "Defied the watch", standingDelta: -5 },
    },
    npcs: {
      "test:keeper": {
        id: "test:keeper",
        name: "Keeper",
        factionId: "test:guild",
        dialogueId: "test:keeper_talk",
        mapId: "fixture",
        schedule: [{ hour: 0, location: "t" }],
        pockets: ["test:pearl"],
        shop: { sells: ["test:trinket"] },
      },
      "test:walker": {
        id: "test:walker",
        name: "Walker",
        factionId: "test:dockers",
        dialogueId: "test:walker_talk",
        mapId: "fixture",
        schedule: [
          { hour: 8, location: "a" },
          { hour: 9, location: "b" },
        ],
        pockets: [],
      },
      "test:guard": {
        id: "test:guard",
        name: "Guard",
        factionId: "test:watch",
        dialogueId: "test:walker_talk",
        mapId: "fixture",
        schedule: [{ hour: 0, location: "g" }],
        pockets: [],
        confront: { standingBelow: -10, dialogueId: "test:guard_confront" },
      },
    },
    dialogues: {
      "test:keeper_talk": {
        id: "test:keeper_talk",
        start: "hello",
        nodes: {
          hello: {
            text: "What'll it be?",
            choices: [
              {
                text: "Compliment",
                effects: [{ type: "deed", deedId: "test:praise" }],
                next: "smile",
              },
              { text: "Insult", effects: [{ type: "deed", deedId: "test:slight" }] },
              {
                text: "Secret?",
                condition: { type: "npc-standing-at-least", value: 10 },
                next: "secret",
              },
              { text: "Bye" },
            ],
          },
          smile: { text: "Much obliged.", choices: [{ text: "Bye" }] },
          secret: { text: "The cellar door is never locked.", choices: [{ text: "Bye" }] },
        },
      },
      "test:walker_talk": {
        id: "test:walker_talk",
        start: "hello",
        nodes: { hello: { text: "Keep moving.", choices: [{ text: "Bye" }] } },
      },
      "test:guard_confront": {
        id: "test:guard_confront",
        start: "halt",
        nodes: {
          halt: {
            text: "Word travels, thief. Pay the fine or answer for it.",
            choices: [
              {
                text: "Pay 20 coin",
                condition: { type: "coin-at-least", value: 20 },
                effects: [
                  { type: "pay", amount: 20 },
                  { type: "deed", deedId: "test:paid_fine" },
                ],
              },
              { text: "I owe you nothing", effects: [{ type: "deed", deedId: "test:defied" }] },
            ],
          },
        },
      },
    },
  };
}
