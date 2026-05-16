import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

test("two entrants build a round 1 bracket; both see the match", async ({ browser, baseURL }) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");
    await a.getByRole("button", { name: /join tournament/ }).click();
    await b.getByRole("button", { name: /join tournament/ }).click();
    await a.getByRole("button", { name: /build bracket/ }).click();
    await expect(b.locator(".br-list li")).toHaveCount(1);
    const text = (await b.locator(".br-list li").first().textContent()) ?? "";
    expect(text).toContain("alice");
    expect(text).toContain("bob");
  } finally {
    await cleanup();
  }
});
