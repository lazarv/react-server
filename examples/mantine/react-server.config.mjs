export default {
  root: "src/pages",
  public: "public",
  optimizeDeps: {
    exclude: ["@mantine/core"],
  },
  resolve: {
    alias: [
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
