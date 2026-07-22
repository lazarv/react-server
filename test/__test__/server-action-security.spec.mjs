import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { hostname, server, serverLogs, testCwd } from "playground/utils";
import { beforeAll, describe, expect, test } from "vitest";

const MODULE_LOADED = "FORGED_NON_ACTION_MODULE_LOADED";
const EXPORT_CALLED = "FORGED_NON_ACTION_EXPORT_CALLED";

describe("server action module allowlist", () => {
  beforeAll(async () => {
    // This fixture imports a real `"use server"` module, ensuring server
    // functions are enabled in both development and production tests.
    await server("fixtures/csrf-action.jsx");
  });

  test("rejects a forged non-action module without importing it", async () => {
    const response = await fetch(`${hostname}/rsc.x-component`, {
      method: "POST",
      body: "[]",
      headers: {
        accept: "text/x-component",
        "content-type": "text/plain;charset=UTF-8",
        "react-server-action": `${resolve(
          testCwd,
          "fixtures/server-action-security-target.mjs"
        ).replaceAll("\\", "/")}#notAnAction`,
      },
    });
    const body = await response.text();

    expect(body).toContain("Server Function Not Found");
    expect(serverLogs).not.toContain(MODULE_LOADED);
    expect(serverLogs).not.toContain(EXPORT_CALLED);
  });

  test("does not expose adapter spawnCommand as a server action", async () => {
    const sideEffectPath = join(
      tmpdir(),
      `react-server-action-spawn-${process.pid}-${randomUUID()}`
    );
    const script = `require("node:fs").writeFileSync(${JSON.stringify(sideEffectPath)}, "spawned")`;

    try {
      expect(existsSync(sideEffectPath)).toBe(false);

      const response = await fetch(`${hostname}/rsc.x-component`, {
        method: "POST",
        body: JSON.stringify([process.execPath, ["-e", script]]),
        headers: {
          accept: "text/x-component",
          "content-type": "text/plain;charset=UTF-8",
          "react-server-action":
            "node_modules/@lazarv/react-server/adapters/core#spawnCommand",
        },
      });
      const body = await response.text();

      expect(body).toContain("Server Function Not Found");
      expect(existsSync(sideEffectPath)).toBe(false);
    } finally {
      await rm(sideEffectPath, { force: true });
    }
  });

  test.skipIf(process.env.NODE_ENV === "production")(
    "allows a plaintext id for an actual server action",
    async () => {
      const response = await fetch(`${hostname}/rsc.x-component`, {
        method: "POST",
        body: "[]",
        headers: {
          accept: "text/x-component",
          "content-type": "text/plain;charset=UTF-8",
          "react-server-action": `${resolve(
            testCwd,
            "fixtures/csrf-actions.mjs"
          ).replaceAll("\\", "/")}#noop`,
        },
      });
      const body = await response.text();

      expect(body).not.toContain("Server Function Not Found");
    }
  );
});
