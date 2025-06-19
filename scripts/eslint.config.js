module.exports = [
  {
    files: ["**/*.ts", "**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parser: require("@typescript-eslint/parser"),
      parserOptions: {
        project: "./tsconfig.json"
      }
    },
    plugins: {
      "@typescript-eslint": require("@typescript-eslint/eslint-plugin")
    },
    rules: {
      // Prevent imports outside of /scripts directory
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../*", "../../*", "../../../*"],
              message: "Scripts cannot import from outside the /scripts directory. Use only Node.js built-ins and scripts/utils."
            }
          ]
        }
      ],
      
      // Other useful rules for script consistency
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "off", // Allow any for CLI outputs
      "@typescript-eslint/explicit-function-return-type": "off",
      
      // Node.js specific rules
      "no-console": "off", // Allow console.log in scripts
      "no-process-exit": "off", // Allow process.exit in scripts
    }
  }
]; 