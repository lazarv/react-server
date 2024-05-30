import svgr from "vite-plugin-svgr";

export default {
  plugins: [svgr()],
  ssr: {
    noExternal: ["@vercel/analytics"],
  },
};
