import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";
import globals from "globals";

const tsSourceFiles = ["src/**/*.{ts,tsx}"];
const tsConfigFiles = ["vite.config.ts"];

const baseTsRules = {
  ...js.configs.recommended.rules,
  ...tsPlugin.configs.recommended.rules,
  ...prettier.rules,
  "no-undef": "off",
};

const reactHooksConfig = reactHooks.configs.flat.recommended;

export default [
  {
    ignores: ["dist/**", "build/**", "node_modules/**"]
  },
  {
    files: tsSourceFiles,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      ...reactHooksConfig.plugins,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...baseTsRules,
      ...reactHooksConfig.rules,
      "react-hooks/set-state-in-effect": "off",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    files: ["src/**/*.{test,spec}.{ts,tsx}", "src/**/*.test.ts", "src/**/*.test.tsx"],
    languageOptions: {
      globals: {
        ...globals.vitest,
      },
    },
  },
  {
    files: tsConfigFiles,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: baseTsRules,
  },
];
