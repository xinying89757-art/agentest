import type { TestSuite, SuiteResult, RunResult, AgentOutput } from "./types.js";
import type { AgentProvider } from "./providers/types.js";
import { runAssertions } from "./assertions/index.js";

export interface RunnerOptions {
  timeout?: number;
}

export async function runSuite(
  suite: TestSuite,
  provider: AgentProvider,
  options: RunnerOptions = {},
): Promise<SuiteResult> {
  const startTime = Date.now();

  const hasOnly = suite.cases.some((c) => c.only);
  const activeCases = hasOnly
    ? suite.cases.filter((c) => c.only && !c.skip)
    : suite.cases.filter((c) => !c.skip);

  const skipped = suite.cases.length - activeCases.length;

  const results: RunResult[] = [];
  for (const testCase of activeCases) {
    results.push(await runTestCase(testCase, provider, options));
  }

  const total = suite.cases.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    suiteName: suite.name,
    total,
    passed,
    failed,
    skipped,
    results,
    durationMs: Date.now() - startTime,
  };
}

async function runTestCase(
  testCase: TestSuite["cases"][number],
  provider: AgentProvider,
  options: RunnerOptions,
): Promise<RunResult> {
  const startTime = Date.now();

  let agentOutput: AgentOutput | undefined;
  try {
    if (options.timeout) {
      agentOutput = await withTimeout(
        provider.run(testCase.input),
        options.timeout,
      );
    } else {
      agentOutput = await provider.run(testCase.input);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      testName: testCase.name,
      passed: false,
      assertions: [{ name: "execution", passed: false, reason: `provider error: ${message}` }],
      durationMs: Date.now() - startTime,
    };
  }

  const assertionResults = runAssertions(agentOutput, testCase.assertions);
  const allPassed = assertionResults.every((a) => a.passed);

  return {
    testName: testCase.name,
    passed: allPassed,
    assertions: assertionResults,
    durationMs: Date.now() - startTime,
    agentOutput,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timeout: test exceeded ${ms}ms`));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
