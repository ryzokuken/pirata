import {
  clockOf,
  currentNode,
  factionStanding,
  npcStanding,
  visibleChoices,
  type GameState,
  type WorldDef,
} from "@pirata/core";

function element<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (found === null) {
    throw new Error(`missing UI element ${selector} (index.html out of sync)`);
  }
  return found;
}

export function renderClock(state: GameState): void {
  const clock = clockOf(state.tick);
  const hour = String(clock.hour).padStart(2, "0");
  const minute = String(clock.minute).padStart(2, "0");
  element<HTMLElement>("#clock").textContent = `Day ${String(clock.day)} — ${hour}:${minute}`;
}

export function renderReputation(state: GameState, world: WorldDef): void {
  const rows: HTMLElement[] = [];
  for (const faction of Object.values(world.factions)) {
    rows.push(reputationRow(faction.id, faction.name, factionStanding(state, world, faction.id)));
  }
  for (const npc of Object.values(world.npcs)) {
    rows.push(reputationRow(npc.id, npc.name, npcStanding(state, world, npc.id)));
  }
  element<HTMLElement>("#reputation-list").replaceChildren(...rows);
}

function reputationRow(id: string, name: string, standing: number): HTMLElement {
  const row = document.createElement("li");
  row.setAttribute("data-testid", id);
  row.textContent = `${name}: ${standing >= 0 ? "+" : ""}${String(standing)}`;
  return row;
}

export function renderDialogue(
  state: GameState,
  world: WorldDef,
  onChoose: (index: number) => void,
): void {
  const panel = element<HTMLElement>("#dialogue");
  const npc = state.dialogue === null ? undefined : world.npcs[state.dialogue.npcId];
  const node = currentNode(state, world);
  if (npc === undefined || node === undefined) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  element<HTMLElement>("#dialogue-name").textContent = npc.name;
  element<HTMLElement>("#dialogue-text").textContent = node.text;
  element<HTMLElement>("#dialogue-choices").replaceChildren(
    ...visibleChoices(state, world).map((choice, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = choice.text;
      button.addEventListener("click", () => {
        onChoose(index);
      });
      item.append(button);
      return item;
    }),
  );
}

let toastTimer: number | undefined;

export function showToast(message: string): void {
  const toast = element<HTMLElement>("#toast");
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 1600);
}
