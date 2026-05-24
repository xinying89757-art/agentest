import type { ParamCase, TestCase, TestSuite } from "./types.js";
import { expandCase } from "./params.js";

export * from "./types.js";
export { AgentProvider } from "./providers/types.js";
export { MockProvider } from "./providers/mock.js";
export type { MockResponse, MockProviderOptions } from "./providers/mock.js";
export { AnthropicProvider } from "./providers/anthropic.js";
export type { AnthropicProviderOptions } from "./providers/anthropic.js";
export { runSuite } from "./runner.js";
export type { RunnerOptions } from "./runner.js";
export { assertions } from "./assertions/index.js";
export { Reporters } from "./reporter.js";
export {
  saveSnapshot,
  loadSnapshot,
  compareSnapshots,
  snapshotPath,
  jaccardSimilarity,
} from "./snapshot.js";
export type {
  SnapshotCase,
  SnapshotFile,
  CaseDiff,
  SnapshotDiff,
} from "./snapshot.js";
export { expandCase, interpolateString } from "./params.js";

function flatCases(
  cases: (TestCase | ParamCase)[],
): TestCase[] {
  return cases.flatMap((c) =>
    "params" in c && Array.isArray(c.params)
      ? expandCase(c as ParamCase)
      : [c as TestCase],
  );
}

export function suite(def: {
  name: string;
  cases: (TestCase | ParamCase)[];
}): TestSuite {
  return { name: def.name, cases: flatCases(def.cases) };
}

suite.parametrized = (pc: ParamCase): TestCase[] => expandCase(pc);
