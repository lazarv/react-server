import { cpus } from "node:os";
import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "playground/utils": resolve(__dirname, "./utils.mjs"),
    },
  },
  test: {
    env: {
      REACT_SERVER_TELEMETRY: "false",
    },
    include: ["**/__test__/**/*.spec.mjs"],
    setupFiles: ["./vitestSetup.mjs"],
    globalSetup: ["./vitestGlobalSetup.mjs"],
    onConsoleLog(log, type) {
      if (
        type === "stderr" &&
        (log.match(/websocket server error/i) ||
          log.match(/error: (redirect|test)/i) ||
          log.match(/generated an empty chunk/i))
      )
        return false;
    },
    testTimeout: 60000,
    hookTimeout: 60000,
    reporters: process.env.GITHUB_ACTIONS
      ? [
          "verbose",
          "github-actions",
          ["junit", { outputFile: "test-results/junit.xml" }],
        ]
      : ["default"],
    pool: "forks",
    maxForks: process.env.CI ? 1 : Math.max(1, cpus().length - 1),
    fileParallelism: !process.env.CI,
    retry: 3,
  },
  publicDir: false,
});
