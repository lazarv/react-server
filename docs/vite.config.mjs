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
  // Allow reading the canonical SKILL.md from the monorepo's `skills/`
  // directory. The agent-skills well-known endpoint serves it verbatim.
  server: {
    fs: {
      allow: ["..", "../skills"],
    },
  },
};
