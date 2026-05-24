import type { ToolCalledAssertion, ToolNotCalledAssertion, AssertionResult, AgentOutput } from "../types.js";

export function validateToolCalled(
  output: AgentOutput,
  assertion: ToolCalledAssertion,
): AssertionResult {
  const called = output.toolCalls.some((tc) => tc.name === assertion.toolName);

  return {
    name: "tool-called",
    passed: called,
    reason: called
      ? `tool "${assertion.toolName}" was called`
      : `expected tool "${assertion.toolName}" to be called, but it was not. Called tools: [${output.toolCalls.map((tc) => tc.name).join(", ")}]`,
  };
}

export function validateToolNotCalled(
  output: AgentOutput,
  assertion: ToolNotCalledAssertion,
): AssertionResult {
  const called = output.toolCalls.some((tc) => tc.name === assertion.toolName);

  return {
    name: "tool-not-called",
    passed: !called,
    reason: !called
      ? `tool "${assertion.toolName}" was not called`
      : `expected tool "${assertion.toolName}" to NOT be called, but it was`,
  };
}
