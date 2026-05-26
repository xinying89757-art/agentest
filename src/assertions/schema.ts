import type { SchemaMatchAssertion, AssertionResult, AgentOutput } from "../types.js";

export function validateSchema(
  output: AgentOutput,
  assertion: SchemaMatchAssertion,
): AssertionResult {
  const lastMessage = output.messages.at(-1);

  if (!lastMessage || lastMessage.role !== "assistant") {
    return {
      name: "schema-match",
      passed: false,
      reason: "no assistant message found in output",
    };
  }

  let parsed: unknown;
  try {
    // Real model output is almost always wrapped in a Markdown code block:
    //   ```json\n{ ... }\n```
    // Attempt to extract the JSON from the code block first; fall back to
    // parsing the raw string so both formats are handled transparently.
    const markdown = lastMessage.content.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = markdown ? markdown[1].trim() : lastMessage.content.trim();
    parsed = JSON.parse(raw);
  } catch {
    return {
      name: "schema-match",
      passed: false,
      reason: `expected valid JSON, got: "${lastMessage.content.slice(0, 100)}"`,
    };
  }

  const result = assertion.schema.safeParse(parsed);

  return {
    name: "schema-match",
    passed: result.success,
    reason: result.success
      ? "output matches expected schema"
      : `schema validation failed: ${result.error.message}`,
  };
}
