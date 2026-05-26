import type { ToolCalledAssertion, ToolNotCalledAssertion, ToolCalledWithAssertion, AssertionResult, AgentOutput } from "../types.js";

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

export function validateToolCalledWith(
  output: AgentOutput,
  assertion: ToolCalledWithAssertion,
): AssertionResult {
  const matchingCalls = output.toolCalls.filter(
    (tc) => tc.name === assertion.toolName,
  );

  if (matchingCalls.length === 0) {
    return {
      name: "tool-called-with",
      passed: false,
      reason: `expected tool "${assertion.toolName}" to be called, but it was not. Called tools: [${output.toolCalls.map((tc) => tc.name).join(", ")}]`,
    };
  }

  // At least one invocation must satisfy the schema.
  // Using Zod (rather than exact object matching) lets the caller use flexible
  // predicates (e.g. z.string().startsWith("ORD-")) and correctly handles the
  // case where the same tool is called multiple times in one turn.
  for (const call of matchingCalls) {
    const result = assertion.schema.safeParse(call.arguments);
    if (result.success) {
      return {
        name: "tool-called-with",
        passed: true,
        reason: `tool "${assertion.toolName}" was called with arguments matching the schema`,
      };
    }
  }

  // All calls failed validation — report errors from the last attempt.
  const lastCall = matchingCalls.at(-1)!;
  const lastResult = assertion.schema.safeParse(lastCall.arguments);
  const errors = !lastResult.success
    ? JSON.stringify(lastResult.error.flatten().fieldErrors, null, 2)
    : "";

  return {
    name: "tool-called-with",
    passed: false,
    reason: `tool "${assertion.toolName}" was called ${matchingCalls.length} time(s) but no call matched the schema.\nArguments received: ${JSON.stringify(lastCall.arguments)}\nSchema errors: ${errors}`,
  };
}
