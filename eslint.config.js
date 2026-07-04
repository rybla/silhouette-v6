import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";
import eslintReact from "@eslint-react/eslint-plugin";
import eslintCss from "@eslint/css";
import eslintJs from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
import eslintReactHooks from "eslint-plugin-react-hooks";
import eslintReactRefresh from "eslint-plugin-react-refresh";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import path from "node:path";
import tseslint from "typescript-eslint";

/**
 * Custom ESLint rule to disallow relative imports and auto-fix them to absolute
 * imports relative to the `src` directory.
 */
const noRelativeImportsRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow relative imports and fix to absolute (src/)",
      recommended: "error",
    },
    fixable: "code", // Enables the `--fix` CLI flag to automatically apply the fix
    schema: [], // No additional configuration options required
    messages: {
      noRelative:
        "Relative imports are not allowed. Use absolute imports instead.",
    },
  },
  create(context) {
    return {
      // Hook into the Abstract Syntax Tree (AST) at every ImportDeclaration
      ImportDeclaration(node) {
        const sourceValue = node.source.value;

        // Step: Identify if the import literal uses a relative path ("./" or "../")
        if (
          typeof sourceValue === "string" &&
          (sourceValue.startsWith("./") || sourceValue.startsWith("../"))
        ) {
          context.report({
            node,
            messageId: "noRelative",

            // Step: Provide an auto-fix implementation
            fix(fixer) {
              // Retrieve the directory of the file currently being linted
              // Fallback to context.filename if context.physicalFilename is unavailable
              const currentFileDir = path.dirname(
                context.physicalFilename || context.filename
              );

              // Resolve the absolute path of the project's 'src' directory
              const srcDir = path.resolve(context.cwd, "src");

              // Resolve the absolute path of the imported module based on the relative import string
              const absoluteImportPath = path.resolve(
                currentFileDir,
                sourceValue
              );

              // Calculate the difference between the 'src' directory and the absolute import path
              let relativeToSrc = path.relative(srcDir, absoluteImportPath);

              // Normalize paths to ensure forward slashes are used (cross-platform consistency)
              relativeToSrc = relativeToSrc.replace(/\\/g, "/");

              // Return the text replacement instruction. We wrap the new path in single quotes.
              // Note: node.source is the entire Literal node (including the original quotes)
              return fixer.replaceText(node.source, `'@/${relativeToSrc}'`);
            },
          });
        }
      },
    };
  },
};

export default defineConfig([
  // Apply global ignores using the new helper to exclude build artifacts and dependencies
  globalIgnores(["dist", "node_modules", ".agent", "drizzle", ".storybook"]),

  // Define the main configuration block for TypeScript React files
  {
    // Target the specific file patterns this configuration applies to
    files: ["**/*.{ts,tsx}"],

    extends: [
      eslintJs.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      eslintReact.configs["recommended-typescript"],
      eslintReact.configs["recommended-type-checked"],
      eslintReact.configs["jsx"],
      eslintReactHooks.configs.flat.recommended,
      eslintReactRefresh.configs.vite,
    ],

    // Set up language options such as the ECMAScript version and browser globals
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },

    // Register the required ESLint plugins locally
    plugins: {
      "simple-import-sort": simpleImportSort,
      "@eslint-community/eslint-comments": eslintComments,
      jsdoc,
      local: {
        rules: {
          "no-relative-imports": noRelativeImportsRule,
        },
      },
    },

    // Define specific linting rules, pulling in React recommendations and overriding defaults
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "jsdoc/no-undefined-types": [
        "error",
        {
          markVariablesAsUsed: true,
        },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "local/no-relative-imports": "error",
      "@typescript-eslint/require-await": "off",
      "@eslint-community/eslint-comments/require-description": "error",
    },

    // Provide general settings expected by the plugins
    settings: {
      react: {
        version: "19.0",
      },
      // Point the plugin to your tsconfig.json so it correctly maps absolute paths from compilerOptions.paths
      path: {
        config: "tsconfig.json",
      },
      jsdoc: {
        mode: "typescript",
      },
    },
  },

  // Lint CSS files
  {
    files: ["**/*.css"],
    language: "css/css",
    ...eslintCss.configs.recommended,
    rules: {
      ...eslintCss.configs.recommended.rules,
      "css/no-invalid-properties": ["error", { allowUnknownVariables: true }],
      "css/use-baseline": "off",
    },
    languageOptions: {
      tolerant: true, // Crucial for PostCSS syntax like nesting and mixins
    },
  },
]);
