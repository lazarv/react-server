import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.{js,mjs,ts}"],
    setupFiles: ["__tests__/setup.mjs"],
    // Use forks pool to isolate test files in separate processes
    // This is needed because React only allows one RSC renderer at a time
    pool: "forks",
    isolate: true,
    coverage: {
      provider: "istanbul",
      reporter: ["text", "json", "html"],
      include: ["server/**/*.mjs", "client/**/*.mjs"],
      exclude: ["client/browser.mjs", "client/index.mjs", "__tests__/**"],
    },
    deps: {
      // Force vite to inline and transform these CJS dependencies
      interopDefault: true,
    },
    server: {
      deps: {
        // Force vite to transform these dependencies
        inline: [/react-server-dom-webpack/, /^react$/, /^react-dom$/],
      },
    },
  },
  ssr: {
    // Process react-server-dom-webpack through vite so resolve conditions apply
    noExternal: [/react-server-dom-webpack/, /^react$/, /^react-dom$/],
    // Use react-server condition for SSR resolution
    resolve: {
      conditions: ["react-server", "browser", "import", "module", "default"],
    },
  },
  resolve: {
    // Enable react-server condition for react-server-dom-webpack server imports
    conditions: ["react-server", "browser", "import", "module", "default"],
  },
});
