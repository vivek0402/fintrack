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
]);

export default eslintConfig;
