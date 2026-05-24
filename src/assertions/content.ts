import type { ContainsAssertion, NotContainsAssertion, AssertionResult, AgentOutput } from "../types.js";

function getResponseText(output: AgentOutput): string {
  const lastMessage = output.messages.at(-1);
  if (!lastMessage || lastMessage.role !== "assistant") return "";
  return lastMessage.content;
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
