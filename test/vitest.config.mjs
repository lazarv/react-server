import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "playground/utils": resolve(__dirname, "./utils.mjs"),
    },
  },
  test: {
    include: ["**/__test__/**/*.spec.mjs"],
    setupFiles: ["./vitestSetup.mjs"],
    globalSetup: ["./vitestGlobalSetup.mjs"],
    onConsoleLog(log, type) {
      if (type === "stderr" && log.match(/websocket server error/i))
        return false;
      if (type === "stderr" && log.match(/error: redirect/i)) return false;
    },
  },
  publicDir: false,
});
