import { paraglide } from "@inlang/paraglide-vite";
import svgr from "vite-plugin-svgr";

export default {
  plugins: [
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
