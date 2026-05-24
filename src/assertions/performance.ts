import type { LatencyAssertion, TokenUsageAssertion, AssertionResult, AgentOutput } from "../types.js";

export function validateLatency(
  output: AgentOutput,
  assertion: LatencyAssertion,
): AssertionResult {
  const passed = output.durationMs < assertion.thresholdMs;

  return {
    name: "latency",
    passed,
    reason: passed
      ? `latency ${output.durationMs}ms < ${assertion.thresholdMs}ms`
      : `latency ${output.durationMs}ms >= threshold ${assertion.thresholdMs}ms`,
  };
}

export function validateTokenUsage(
  output: AgentOutput,
  assertion: TokenUsageAssertion,
): AssertionResult {
  const totalTokens = output.usage.inputTokens + output.usage.outputTokens;
  const passed = totalTokens <= assertion.maxTokens;

  return {
    name: "token-usage",
    passed,
    reason: passed
      ? `token usage ${totalTokens} <= ${assertion.maxTokens}`
      : `token usage ${totalTokens} > limit ${assertion.maxTokens}`,
  };
}
