export default {
  root: "app",
  public: "public",
  page: {
    include: ["**/page.jsx"],
  },
  layout: {
    include: ["**/layout.jsx"],
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        advancedChunks: {
          groups: [
            {
              name: "vendor",
              test: /@emotion/,
            },
          ],
        },
      },
    },
  },
};
