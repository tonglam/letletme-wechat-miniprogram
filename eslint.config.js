const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  { ignores: ["node_modules/", "**/miniprogram_npm/**", "dist/", "**/dist/**"] },
  { files: ["**/*.ts"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": "warn"
    }
  }
);
