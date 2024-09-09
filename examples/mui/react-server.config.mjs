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
          if (id.includes("@emotion/react")) {
            return "@emotion/react";
          }
          if (id.includes("@mui/")) {
            return "@mui/material";
          }
        },
      },
    },
  },
};
