import {
  buyPrice,
  clockOf,
  currentNode,
  factionStanding,
  hungerStage,
  npcStanding,
  PLAYER_COMBAT,
  sellPrice,
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

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function renderStatus(state: GameState): void {
  element<HTMLElement>("#hp").textContent =
    `HP ${String(state.player.hp)}/${String(PLAYER_COMBAT.maxHp)}`;
  element<HTMLElement>("#hunger").textContent = capitalize(hungerStage(state.player.hunger));
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

export function renderInventory(
  state: GameState,
  world: WorldDef,
  onEat: (index: number) => void,
): void {
  element<HTMLElement>("#coin").textContent = `Coin: ${String(state.player.coin)}`;
  element<HTMLElement>("#inventory-list").replaceChildren(
    ...state.player.items.map((itemId, index) => {
      const row = document.createElement("li");
      const def = world.items[itemId];
      const label = document.createElement("span");
      label.textContent = def?.name ?? itemId;
      row.append(label);
      if (def?.food !== undefined) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Eat";
        button.addEventListener("click", () => {
          onEat(index);
        });
        row.append(button);
      }
      return row;
    }),
  );
}

export function renderJournal(state: GameState, world: WorldDef): void {
  element<HTMLElement>("#journal-list").replaceChildren(
    ...state.rumors.map((rumorId) => {
      const row = document.createElement("li");
      row.textContent = world.rumors[rumorId]?.text ?? rumorId;
      return row;
    }),
  );
}

export function renderCombat(
  state: GameState,
  world: WorldDef,
  onAttack: (index: number) => void,
): void {
  const panel = element<HTMLElement>("#combat");
  if (state.combat === null) {
    panel.hidden = true;
    return;
  }
  const combat = state.combat;
  panel.hidden = false;
  element<HTMLElement>("#combat-enemies").replaceChildren(
    ...combat.enemyIds.map((npcId, index) => combatRow(state, world, npcId, index, onAttack)),
  );
}

function combatRow(
  state: GameState,
  world: WorldDef,
  npcId: string,
  index: number,
  onAttack: (index: number) => void,
): HTMLElement {
  const def = world.npcs[npcId];
  const npc = state.npcs.find((candidate) => candidate.id === npcId);
  const maxHp = def?.combat?.maxHp ?? 0;
  const hp = npc?.hp ?? 0;
  const row = document.createElement("li");
  row.setAttribute("data-testid", npcId);
  const label = document.createElement("span");
  label.textContent = `${def?.name ?? npcId} — HP ${String(hp)}/${String(maxHp)}`;
  const bar = document.createElement("progress");
  bar.max = maxHp;
  bar.value = hp;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Attack";
  button.addEventListener("click", () => {
    onAttack(index);
  });
  row.append(label, bar, button);
  return row;
}

export function showDefeatBanner(): void {
  element<HTMLElement>("#defeat-banner").hidden = false;
}

export function hideDefeatBanner(): void {
  element<HTMLElement>("#defeat-banner").hidden = true;
}

export function renderTrade(
  state: GameState,
  world: WorldDef,
  handlers: { onBuy: (index: number) => void; onSell: (index: number) => void },
): void {
  const panel = element<HTMLElement>("#trade");
  const npc = state.trade === null ? undefined : world.npcs[state.trade.npcId];
  if (npc === undefined || state.trade === null) {
    panel.hidden = true;
    return;
  }
  const npcId = state.trade.npcId;
  panel.hidden = false;
  element<HTMLElement>("#trade-name").textContent = `Trading with ${npc.name}`;
  element<HTMLElement>("#trade-stock").replaceChildren(
    ...(npc.shop?.sells ?? []).map((itemId, index) =>
      tradeRow(
        `Buy ${world.items[itemId]?.name ?? itemId} — ${String(
          buyPrice(state, world, npcId, itemId) ?? "?",
        )}c`,
        () => {
          handlers.onBuy(index);
        },
      ),
    ),
  );
  element<HTMLElement>("#trade-goods").replaceChildren(
    ...state.player.items.map((itemId, index) =>
      tradeRow(
        `Sell ${world.items[itemId]?.name ?? itemId} — ${String(
          sellPrice(state, world, npcId, itemId) ?? "?",
        )}c`,
        () => {
          handlers.onSell(index);
        },
      ),
    ),
  );
}

function tradeRow(label: string, onClick: () => void): HTMLElement {
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  item.append(button);
  return item;
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
