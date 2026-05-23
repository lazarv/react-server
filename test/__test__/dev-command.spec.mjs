import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PassThrough } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";

import { expect, test } from "vitest";

import {
  getInitialSearchInput,
  restoreCommandInput,
  writeInitialSearchInput,
} from "../../packages/react-server/lib/dev/command.mjs";

const require = createRequire(import.meta.url);
const promptsPath = require.resolve("@inquirer/prompts", {
  paths: [
    fileURLToPath(new URL("../../packages/react-server", import.meta.url)),
  ],
});
const { search } = await import(pathToFileURL(promptsPath).href);

async function waitFor(predicate, timeout = 1000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error("timed out waiting for prompt update");
    }
    await delay(5);
  }
}

test("dev command prompt replays the opening search key once", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();

  const terms = [];
  const answer = search(
    {
      message: "",
      source: async (term) => {
        terms.push(term ?? "");
        return [{ name: term || "empty", value: "ok" }];
      },
    },
    { input, output }
  );

  writeInitialSearchInput(input, "o");
  await waitFor(() => terms.includes("o"));
  input.write("\r");

  await expect(answer).resolves.toBe("ok");
  expect(terms).toContain("o");
  expect(terms).not.toContain("oo");
});

test("dev command prompt only seeds printable opening keys", () => {
  expect(getInitialSearchInput("o", { name: "o" })).toBe("o");
  expect(getInitialSearchInput("\r", { name: "return" })).toBe("");
  expect(getInitialSearchInput("\u0003", { ctrl: true, name: "c" })).toBe("");
  expect(getInitialSearchInput("\u001B[A", { name: "up" })).toBe("");
});

test("dev command restores stdin after prompt cleanup", () => {
  const input = new PassThrough();
  let rawMode;

  input.isTTY = true;
  input.setRawMode = (value) => {
    rawMode = value;
  };
  input.pause();

  restoreCommandInput(input);

  expect(input.isPaused()).toBe(false);
  expect(rawMode).toBe(true);
});
