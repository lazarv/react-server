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
        manualChunks(id) {
          if (id.includes("@mantine/core")) {
            return "@mantine/core";
          }
        },
      },
    },
  },
};
