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
    // Android build artifacts — not source code
    "android/**",
    // Service worker + workbox build artifacts
    "public/sw.js",
    "public/swe-worker-*.js",
    "public/workbox-*.js",
    // Icon generation scripts (Node.js, not typed)
    "scripts/**",
  ]),
  {
    rules: {
      // API response shapes are typed at runtime — 'any' is intentional in fetch handlers
      "@typescript-eslint/no-explicit-any": "warn",
      // Initializing state from localStorage/sessionStorage inside effects is a valid pattern
      "react-hooks/set-state-in-effect": "warn",
      // Unescaped entities in JSX are cosmetic — address at content review time
      "react/no-unescaped-entities": "warn",
      // Date.now() / new Date() inside useMemo is a valid pattern for snapshotting time
      "react-hooks/purity": "warn",
      // let variables mutated in place (e.g. Date.setDate) inside useMemo are valid
      "react-hooks/immutability": "warn",
    },
  },
]);

export default eslintConfig;
