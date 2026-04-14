import { defineConfig } from "vitest/config";

export default defineConfig({
  // Ensure react-server-dom-webpack loads its production build.
  // Without this, NODE_ENV defaults to "test" in vitest, which causes
  // webpack to load the development bundle (2x larger, with extensive
  // validation and debug assertions) — making the comparison unfair.
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  test: {
    benchmark: {
      include: ["__bench__/**/*.bench.{js,mjs,ts}"],
    },
    globals: true,
    environment: "node",
    setupFiles: ["__bench__/setup.mjs"],
    // Isolate each bench file in its own process — React allows only one
    // RSC renderer per process, so @lazarv/rsc and react-server-dom-webpack
    // must live in separate files/processes.
    pool: "forks",
    isolate: true,
    deps: {
      interopDefault: true,
    },
    server: {
      deps: {
        inline: [/react-server-dom-webpack/, /^react$/, /^react-dom$/],
      },
    },
  },
  ssr: {
    noExternal: [/react-server-dom-webpack/, /^react$/, /^react-dom$/],
    resolve: {
      conditions: ["react-server", "browser", "import", "module", "default"],
    },
  },
  resolve: {
    conditions: ["react-server", "browser", "import", "module", "default"],
  },
});
