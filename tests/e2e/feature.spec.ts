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

// The ADVERTISED core action: "opponents scan each other to record outcomes".
// Peer A records a win over peer B by pasting B's QR payload (the camera-free
// fallback of QRExchange). The match outcome must then propagate to BOTH
// screens — the winner is marked and the champion is announced on peer B too.
test("recording a match outcome via QR/paste advances the bracket on BOTH peers", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");
    await a.getByRole("button", { name: /join tournament/ }).click();
    await b.getByRole("button", { name: /join tournament/ }).click();
    await a.getByRole("button", { name: /build bracket/ }).click();
    await expect(a.locator(".br-list li")).toHaveCount(1);
    await expect(b.locator(".br-list li")).toHaveCount(1);

    // Before recording, neither peer should show a champion.
    await expect(a.locator(".viral-status")).toContainText("in progress");
    await expect(b.locator(".viral-status")).toContainText("in progress");

    // Grab peer B's real QR payload (the "copy raw payload" disclosure carries
    // makeScanPayload(room, B.peerId, name)) and paste it on peer A. This is
    // exactly what "i beat them — scan their QR" does, headless.
    const bPayload = (await b.locator(".mesh-qrx-payload code").first().textContent()) ?? "";
    expect(bPayload).toMatch(/[#?].*p=/);

    await a.getByLabel("paste payload").fill(bPayload);
    await a.getByRole("button", { name: /^use$/ }).click();

    // The winning entrant (alice) must be marked on BOTH screens, and the
    // champion (alice) announced on BOTH — the outcome crossed the mesh.
    await expect(a.locator(".br-list li .is-winner").first()).toHaveText("alice");
    await expect(b.locator(".br-list li .is-winner").first()).toHaveText("alice");
    await expect(a.locator(".br-result").first()).toContainText("alice");
    await expect(b.locator(".br-result").first()).toContainText("alice");
    await expect(a.locator(".viral-status")).toContainText("🏆 alice");
    await expect(b.locator(".viral-status")).toContainText("🏆 alice");
  } finally {
    await cleanup();
  }
});
