import { join } from "node:path";

import { hostname, page, server } from "playground/utils";
import { expect, test } from "vitest";

process.env.POKEMON_LIMIT = "20";
process.chdir(join(process.cwd(), "../examples/pokemon"));

test("pokemon load", async () => {
  await server(null);
  await page.goto(hostname);
  await page.waitForLoadState("networkidle");
  expect(await page.textContent("body")).toContain("Pokémon Catalog");
});
