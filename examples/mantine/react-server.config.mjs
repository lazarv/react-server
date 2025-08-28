export default {
  root: "src/pages",
  public: "public",
  optimizeDeps: {
    exclude: ["@mantine/core"],
  },
  build: {
    rollupOptions: {
      output: {
        advancedChunks: {
          groups: [
            {
              name: "@mantine/core",
              test: /@mantine\/core\//,
            },
            {
              name: "@mantine/modals",
              test: /@mantine\/modals\//,
            },
            {
              name: "@mantine/notifications",
              test: /@mantine\/notifications\//,
            },
          ],
        },
      },
    },
  },
};
