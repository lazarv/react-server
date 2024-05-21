/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{jsx,mdx}"],
  theme: {
    extend: {},
  },
  plugins: [],
  darkMode: [
    "variant",
    [
      "@media (prefers-color-scheme: dark) { &:not(.light *) }",
      "&:is(.dark *)",
    ],
  ],
};
