import type { ContainsAssertion, NotContainsAssertion, AssertionResult, AgentOutput } from "../types.js";

function getResponseText(output: AgentOutput): string {
  // Collect all assistant message content, not just the last message.
  // When the model's final turn is a tool_use block (no text), at(-1) would
  // return an empty string or a non-assistant message, causing contains to
  // silently fail and notContains to silently pass.
  return output.messages
    .filter((m) => m.role === "assistant" && m.content.length > 0)
    .map((m) => m.content)
    .join("\n");
}

export function validateContains(
  output: AgentOutput,
  assertion: ContainsAssertion,
): AssertionResult {
  const text = getResponseText(output);
  const pattern = assertion.pattern;
  const passed = typeof pattern === "string"
    ? text.includes(pattern)
    : pattern.test(text);

  return {
    name: "contains",
    passed,
    reason: passed
      ? `output contains "${pattern}"`
      : `expected output to contain "${pattern}", got: "${text.slice(0, 200)}"`,
  };
}

export function validateNotContains(
  output: AgentOutput,
  assertion: NotContainsAssertion,
): AssertionResult {
  const text = getResponseText(output);
  const pattern = assertion.pattern;
  const found = typeof pattern === "string"
    ? text.includes(pattern)
    : pattern.test(text);

  return {
    name: "not-contains",
    passed: !found,
    reason: !found
      ? `output does not contain "${pattern}"`
      : `expected output to NOT contain "${pattern}", but found it in: "${text.slice(0, 200)}"`,
  };
}
