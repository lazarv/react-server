import { paraglide } from "@inlang/paraglide-vite";
import react from "@vitejs/plugin-react-swc";
import svgr from "vite-plugin-svgr";

export default {
  plugins: [
    react(),
    svgr(),
    paraglide({
      project: "./project.inlang",
      outdir: "./src/paraglide",
    }),
  ],
  resolve: {
    external: ["lucide-react"],
  },
};
