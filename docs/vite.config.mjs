import svgr from "vite-plugin-svgr";

export default {
  plugins: [svgr()],
  resolve: {
    noExternal: ["@vercel/analytics", "@vercel/speed-insights"],
  },
};
