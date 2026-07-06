/* eslint-disable no-underscore-dangle -- __pirata is the documented Window debug-hook name (e2e/types.d.ts) */
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__pirata !== undefined);
});

test("NPCs stand at their scheduled morning posts", async ({ page }) => {
  const npcs = await page.evaluate(() => window.__pirata?.getState().npcs);
  expect(npcs).toContainEqual({ id: "base:tavernkeeper", pos: { x: 3, y: 3 } });
  expect(npcs).toContainEqual({ id: "base:merchant", pos: { x: 9, y: 3 } });
  expect(npcs).toContainEqual({ id: "base:harbormaster", pos: { x: 17, y: 10 } });
  expect(npcs).toContainEqual({ id: "base:stevedore", pos: { x: 17, y: 11 } });
});

test("talking to the harbormaster runs a dialogue and moves reputation", async ({ page }) => {
  await page.evaluate(() => {
    for (let i = 0; i < 4; i += 1) {
      window.__pirata?.dispatch({ type: "move", direction: "south" });
    }
    window.__pirata?.dispatch({ type: "talk" });
  });
  await expect(page.getByTestId("dialogue-text")).toContainText("State your business");
  await page.getByRole("button", { name: "Lend a hand with the cargo." }).click();
  await expect(page.getByTestId("dialogue-text")).toContainText("grunts");
  const deeds = await page.evaluate(() => window.__pirata?.getState().deeds);
  expect(deeds).toEqual([{ deedId: "base:lent_a_hand", npcId: "base:harbormaster", tick: 4 }]);
  await expect(page.getByTestId("base:dockworkers")).toContainText("+10");
  await page.getByRole("button", { name: "Anytime." }).click();
  const dialogue = await page.evaluate(() => window.__pirata?.getState().dialogue);
  expect(dialogue).toBeNull();
});

test("time passes and NPCs follow their schedules", async ({ page }) => {
  await page.evaluate(() => {
    for (let i = 0; i < 110; i += 1) {
      window.__pirata?.dispatch({ type: "wait" });
    }
  });
  await expect(page.getByTestId("clock")).toContainText("19:00");
  const merchant = await page.evaluate(
    () => window.__pirata?.getState().npcs.find((npc) => npc.id === "base:merchant")?.pos,
  );
  expect(merchant).not.toEqual({ x: 9, y: 3 });
});
