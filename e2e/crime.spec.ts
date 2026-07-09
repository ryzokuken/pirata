/* eslint-disable no-underscore-dangle -- __pirata is the documented Window debug-hook name (e2e/types.d.ts) */
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__pirata !== undefined);
});

// Spawn is (17,5); the silk bolt sits at (10,3) inside the market, watched
// by the merchant at (9,3).
async function walkToStall(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    for (let i = 0; i < 7; i += 1) {
      window.__pirata?.dispatch({ type: "move", direction: "west" });
    }
    for (let i = 0; i < 2; i += 1) {
      window.__pirata?.dispatch({ type: "move", direction: "north" });
    }
  });
}

test("stealing in front of the merchant is witnessed and remembered", async ({ page }) => {
  await walkToStall(page);
  await page.evaluate(() => {
    window.__pirata?.dispatch({ type: "take" });
  });
  const state = await page.evaluate(() => window.__pirata?.getState());
  expect(state?.player.items).toContain("base:silk_bolt");
  const theft = state?.deeds.find((deed) => deed.deedId === "base:theft");
  expect(theft?.knownBy).toContain("base:merchant");
  await expect(page.getByTestId("base:merchants_guild")).toContainText("-20");
});

test("a hostile merchant refuses to trade", async ({ page }) => {
  await walkToStall(page);
  await page.evaluate(() => {
    window.__pirata?.dispatch({ type: "take" });
    window.__pirata?.dispatch({ type: "trade" });
  });
  const trade = await page.evaluate(() => window.__pirata?.getState().trade);
  expect(trade).toBeNull();
});

test("buying and selling moves coin and goods", async ({ page }) => {
  await walkToStall(page);
  await page.evaluate(() => {
    window.__pirata?.dispatch({ type: "trade" });
  });
  await expect(page.getByTestId("coin")).toContainText("20");
  await page.getByRole("button", { name: /Buy Bottle of rum/ }).click();
  await expect(page.getByTestId("coin")).toContainText("14");
  await page.getByRole("button", { name: /Sell Bottle of rum/ }).click();
  await expect(page.getByTestId("coin")).toContainText("17");
  await page.evaluate(() => {
    window.__pirata?.dispatch({ type: "close-trade" });
  });
  const state = await page.evaluate(() => window.__pirata?.getState());
  expect(state?.player.items).toEqual([]);
  expect(state?.trade).toBeNull();
});

test("sneaking doubles the cost of a step", async ({ page }) => {
  await page.evaluate(() => {
    window.__pirata?.dispatch({ type: "sneak" });
    window.__pirata?.dispatch({ type: "move", direction: "west" });
  });
  const state = await page.evaluate(() => window.__pirata?.getState());
  expect(state?.player.sneaking).toBe(true);
  expect(state?.tick).toBe(2);
});
