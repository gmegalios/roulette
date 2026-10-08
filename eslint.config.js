import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  { ignores: ["dist/**"] },
  {
    files: ["src/**/*.{js,jsx}", "vite.config.js", "api/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node }
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.flat.recommended.rules,
      "react/jsx-uses-vars": "error",
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "react-refresh/only-export-components": ["warn", { "allowConstantExport": true }]
    }
  }
];
