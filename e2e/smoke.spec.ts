/* eslint-disable no-underscore-dangle -- __pirata is the documented Window debug-hook name (e2e/types.d.ts) */
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__pirata !== undefined);
});

test("boots and the core responds to dispatched intents", async ({ page }) => {
  const before = await page.evaluate(() => window.__pirata?.getState().player.pos);
  await page.evaluate(() => window.__pirata?.dispatch({ type: "move", direction: "east" }));
  const after = await page.evaluate(() => window.__pirata?.getState().player.pos);
  expect(after).not.toEqual(before);
});

test("keyboard input moves the player", async ({ page }) => {
  const before = await page.evaluate(() => window.__pirata?.getState().tick ?? 0);
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction((tick) => (window.__pirata?.getState().tick ?? 0) > tick, before);
  await page.keyboard.up("ArrowRight");
});
