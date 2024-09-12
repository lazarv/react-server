import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export default {
  root: "src/pages",
  public: "public",
  optimizeDeps: {
    exclude: ["@mantine/core"],
  },
  resolve: {
    alias: [
      {
        find: "victory-vendor/d3-shape",
        replacement: require
          .resolve("victory-vendor/d3-shape")
          .replace("/lib/", "/es/"),
      },
      {
        find: "victory-vendor/d3-scale",
        replacement: require
          .resolve("victory-vendor/d3-scale")
          .replace("/lib/", "/es/"),
      },
      {
        find: "highlight.js",
        replacement: "highlight.js",
      },
    ],
    external: ["dayjs"],
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@mantine/core")) {
            return "@mantine/core";
          }
        },
      },
    },
  },
};
