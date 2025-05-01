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
    rollupOptions: {
      output: {
        advancedChunks: {
          groups: [
            {
              name: "@tanstack/react-query",
              test: /@tanstack\/react-query\//,
            },
          ],
        },
      },
    },
  },
};
