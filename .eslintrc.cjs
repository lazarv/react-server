module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
    "plugin:jsx-a11y/recommended",
    "prettier",
  ],
  overrides: [
    {
      env: {
        node: true,
      },
      files: [".eslintrc.{js,cjs}"],
      parserOptions: {
        sourceType: "script",
      },
    },
    {
      env: {
        node: true,
      },
      files: ["*.{ts,tsx}"],
      extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
      parser: "@typescript-eslint/parser",
      plugins: ["@typescript-eslint"],
      rules: {
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_" },
        ],
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/explicit-module-boundary-types": "off",
      },
    },
  ],
  parser: "@babel/eslint-parser",
  parserOptions: {
    requireConfigFile: false,
    babelOptions: {
      presets: ["@babel/preset-react"],
      plugins: ["@babel/plugin-syntax-import-assertions"],
    },
    ecmaFeatures: {
      jsx: true,
    },
    sourceType: "module",
  },
  plugins: ["react", "simple-import-sort", "jsx-a11y"],
  settings: {
    react: {
      version: "experimental",
    },
  },
  rules: {
    "react/prop-types": "off",
    "simple-import-sort/imports": ["error"],
  },
  exclude: ["./packages/client/react*/**", "./packages/server/react*/**"],
};
