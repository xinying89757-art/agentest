import type { TestSuite, SuiteResult, RunResult, AgentOutput } from "./types.js";
import type { AgentProvider } from "./providers/types.js";
import { runAssertions } from "./assertions/index.js";
import { hashAgentInput } from "./snapshot.js";

export interface RunnerOptions {
  timeout?: number;
  /** Maximum number of test cases to run concurrently. Defaults to 5. */
  concurrency?: number;
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

  // Pre-compute stable input hashes for all active cases (used for snapshot keys).
  const inputHashes = new Map<string, string>();
  for (const c of activeCases) {
    inputHashes.set(c.name, hashAgentInput(c.input));
  }

  // P0-4: Run test cases concurrently instead of serially.
  // A semaphore (pool of N slots) prevents bursting the full suite at once,
  // which would risk hitting API rate limits.
  const concurrency = options.concurrency ?? 5;
  const results = await runConcurrent(
    activeCases,
    (testCase) => runTestCase(testCase, provider, options),
    concurrency,
  );

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
    inputHashes,
  };
}

/**
 * Runs `tasks` with at most `limit` running at the same time, preserving the
 * original order in the returned results array.
 */
async function runConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
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
      // P0-3: Use an AbortController so that when the timeout fires we call
      // abort(), which causes the Anthropic SDK to cancel the underlying HTTP
      // request. Previously only the Promise was rejected while the network
      // request kept running (and consuming tokens).
      const controller = new AbortController();
      agentOutput = await withTimeout(
        provider.run(testCase.input, controller.signal),
        options.timeout,
        controller,
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

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  controller: AbortController,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      // Cancel the underlying HTTP request, not just the promise.
      controller.abort();
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

