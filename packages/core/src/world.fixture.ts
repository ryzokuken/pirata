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
  return { id: "fixture", width, height, blocked, playerSpawn: spawn, locations, items };
}

export const FIXTURE_MAP = mapFromAscii([
  "########",
  "#P....a#",
  "#.####.#",
  "#b.....#",
  "####t###",
  "########",
]);

export function fixtureWorld(): WorldDef {
  return {
    map: FIXTURE_MAP,
    factions: {
      "test:guild": { id: "test:guild", name: "The Guild" },
      "test:dockers": { id: "test:dockers", name: "The Dockers" },
    },
    deeds: {
      "test:praise": { id: "test:praise", name: "Praise", standingDelta: 10 },
      "test:slight": { id: "test:slight", name: "Slight", standingDelta: -10 },
    },
    npcs: {
      "test:keeper": {
        id: "test:keeper",
        name: "Keeper",
        factionId: "test:guild",
        dialogueId: "test:keeper_talk",
        schedule: [{ hour: 0, location: "t" }],
      },
      "test:walker": {
        id: "test:walker",
        name: "Walker",
        factionId: "test:dockers",
        dialogueId: "test:walker_talk",
        schedule: [
          { hour: 8, location: "a" },
          { hour: 9, location: "b" },
        ],
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
    },
  };
}
