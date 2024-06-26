import react from "@vitejs/plugin-react-swc";
import svgr from "vite-plugin-svgr";

export default {
  plugins: [react(), svgr()],
  resolve: {
    noExternal: ["@vercel/analytics", "@vercel/speed-insights"],
  },
};
