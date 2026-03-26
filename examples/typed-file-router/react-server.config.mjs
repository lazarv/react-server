import { defineConfig } from "@lazarv/react-server/config";

export default defineConfig({
  root: "pages",
  routes: {
    "/virtual": "./src/virtual-page.tsx",
  },
});
