import type { TestCase, TestSuite } from "./types.js";

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

export function suite(def: { name: string; cases: TestCase[] }): TestSuite {
  return { name: def.name, cases: def.cases };
}
