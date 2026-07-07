import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // core/ is the framework-agnostic engine that must remain portable to
    // Catalyst later — it can never depend on Next.js/React or touch the DB
    // directly (that's server/'s job).
    files: ["core/**/*.ts", "core/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*", "react", "react/*", "react-dom*"],
              message: "core/ must stay framework-agnostic — no Next.js/React imports.",
            },
            {
              group: ["*/server/db/*", "../server/db/*", "../../server/db/*"],
              message: "core/ must not access the database directly — that belongs in server/.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
