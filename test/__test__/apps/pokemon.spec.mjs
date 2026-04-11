import { appDir, hostname, page, server } from "playground/utils";
import { expect, test } from "vitest";

process.env.POKEMON_LIMIT = "20";

test("pokemon load", async () => {
  await server(null, { cwd: appDir("examples/pokemon") });
  await page.goto(hostname);
  await page.waitForLoadState("networkidle");
  expect(await page.textContent("body")).toContain("Pokémon Catalog");
});
