import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@/": new URL("src/", import.meta.url).pathname,
    },
  },
  plugins: [tailwindcss()],
});
