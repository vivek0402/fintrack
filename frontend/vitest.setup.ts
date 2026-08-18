import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// RTL's own auto-cleanup only registers if it detects a global `afterEach` at
// import time, which requires vitest's `test.globals: true` -- deliberately
// left off so test files don't need extra tsconfig `types` entries. Wire it
// explicitly here instead so no individual test file has to remember to.
afterEach(cleanup);
