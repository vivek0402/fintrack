// Minimal ESLint flat config for the backend (CommonJS Node/Express app).
// Intentionally narrow: catch real bugs (unused vars, undefined globals/typos)
// without imposing a stylistic ruleset on an existing, unlinted codebase.
const nodeGlobals = {
  process: "readonly",
  console: "readonly",
  Buffer: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  module: "writable",
  require: "readonly",
  exports: "writable",
  global: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  setImmediate: "readonly",
  clearImmediate: "readonly",
  queueMicrotask: "readonly",
  fetch: "readonly",
  URLSearchParams: "readonly",
  URL: "readonly",
};

const jestGlobals = {
  describe: "readonly",
  it: "readonly",
  test: "readonly",
  expect: "readonly",
  beforeEach: "readonly",
  afterEach: "readonly",
  beforeAll: "readonly",
  afterAll: "readonly",
  jest: "readonly",
};

module.exports = [
  {
    ignores: ["node_modules/**"],
  },
  {
    languageOptions: {
      sourceType: "commonjs",
      globals: nodeGlobals,
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "warn",
      "no-const-assign": "error",
      "no-dupe-keys": "error",
      "no-unreachable": "error",
    },
  },
  {
    files: ["tests/**"],
    languageOptions: {
      globals: {
        ...nodeGlobals,
        ...jestGlobals,
      },
    },
  },
];
