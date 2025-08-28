import path from "node:path";
import { fileURLToPath } from "node:url";

import babelParser from "@babel/eslint-parser";
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js"; /*<%=props.eslint.typescript.import %>*/
import jsxA11Y from "eslint-plugin-jsx-a11y"; /*<%=props.eslint.prettier.import %>*/
import react from "eslint-plugin-react"; /*<%=props.eslint.reactCompiler.import %>*/
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    ignores: [
      "**/node_modules/",
      "**/dist/",
      "**/build/",
      "**/.react-server/",
      "**/.react-server*/",
      "**/.vercel/",
      "*.mdx",
      "*.md",
      "*.json",
      "*-lock.*",
    ],
  },
  ...compat.extends(
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
    "plugin:jsx-a11y/recommended"
    /*<%=props.eslint.prettier.compat %>*/
  ),
  {
    plugins: {
      react,
      /*<%=props.eslint.reactCompiler.plugin %>*/
      "simple-import-sort": simpleImportSort,
      /*<%=props.eslint.prettier.plugin %>*/
      "jsx-a11y": jsxA11Y,
    },

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        Deno: "readonly",
      },

      parser: babelParser,
      ecmaVersion: "latest",
      sourceType: "module",

      parserOptions: {
        requireConfigFile: false,

        babelOptions: {
          presets: ["@babel/preset-react"],
          plugins: ["@babel/plugin-syntax-import-assertions"],
        },

        ecmaFeatures: {
          jsx: true,
        },
      },
    },

    settings: {
      react: {
        version: "19.0.0",
      },
    },

    rules: {
      "react/prop-types": "off",
      /*<%=props.eslint.reactCompiler.rules %>*/
      "simple-import-sort/imports": [
        "error",
        {
          groups: [["^\\u0000"], ["^node:"], ["^react"], ["^[^.]"], ["^\\."]],
        },
      ],

      "no-async-promise-executor": "off",

      /*<%=props.eslint.prettier.rules %>*/
    },
  },
  /*<%=props.eslint.typescript.config %>*/
];
