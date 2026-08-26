import { defineConfig } from "vitest/config";

// Two kinds of tests live under convex/:
//  - Pure-TS unit tests (e.g. lib/senderAuth.test.ts) — run in the default
//    node environment, no Convex harness.
//  - Convex-function tests (Task 4+) — use convex-test and MUST run in the
//    edge-runtime environment. Those files opt in per-file with the docblock:
//        // @vitest-environment edge-runtime
//    so we keep the global environment as node here and let those files switch.
export default defineConfig({
  test: {
    environment: "node",
    include: ["convex/**/*.test.ts", "src/**/*.test.ts"],
  },
});
