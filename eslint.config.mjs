import path from "node:path";
import { fileURLToPath } from "node:url";

import babelParser from "@babel/eslint-parser";
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import jsxA11Y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-plugin-prettier";
import react from "eslint-plugin-react";
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
      "packages/react-server/lib/plugins/file-router/react-server-router.d.ts",
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
    "plugin:jsx-a11y/recommended",
    "plugin:prettier/recommended"
  ),
  {
    plugins: {
      react,
      "simple-import-sort": simpleImportSort,
      prettier,
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

      "simple-import-sort/imports": [
        "error",
        {
          groups: [["^\\u0000"], ["^node:"], ["^react"], ["^[^.]"], ["^\\."]],
        },
      ],

      "no-async-promise-executor": "off",

      "prettier/prettier": [
        "error",
        {
          endOfLine: "auto",
        },
      ],
    },
  },
  ...compat
    .extends("eslint:recommended", "plugin:@typescript-eslint/recommended")
    .map((config) => ({
      ...config,
      files: ["**/*.{ts,tsx}"],
    })),
  {
    files: ["**/*.{ts,tsx}"],

    plugins: {
      "@typescript-eslint": typescriptEslint,
    },

    languageOptions: {
      globals: {
        ...globals.node,
      },

      parser: tsParser,
    },

    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
        },
      ],

      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
    },
  },
];
