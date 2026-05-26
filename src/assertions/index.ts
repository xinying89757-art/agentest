import type { Assertion, AgentOutput, AssertionResult } from "../types.js";
import { z } from "zod";
import { validateSchema } from "./schema.js";
import { validateContains, validateNotContains } from "./content.js";
import { validateToolCalled, validateToolNotCalled, validateToolCalledWith } from "./tool-calls.js";
import { validateLatency, validateTokenUsage } from "./performance.js";

function runSingle(output: AgentOutput, assertion: Assertion): AssertionResult {
  switch (assertion.type) {
    case "schema-match":       return validateSchema(output, assertion);
    case "contains":           return validateContains(output, assertion);
    case "not-contains":       return validateNotContains(output, assertion);
    case "tool-called":        return validateToolCalled(output, assertion);
    case "tool-not-called":    return validateToolNotCalled(output, assertion);
    case "tool-called-with":   return validateToolCalledWith(output, assertion);
    case "latency":            return validateLatency(output, assertion);
    case "token-usage":        return validateTokenUsage(output, assertion);
  }
}

export function runAssertions(
  output: AgentOutput,
  assertions: Assertion[],
): AssertionResult[] {
  return assertions.map((a) => runSingle(output, a));
}

export const assertions = {
  schemaMatch: (schema: z.ZodType<unknown>) =>
    ({ type: "schema-match", schema } as const),

  contains: (pattern: string | RegExp) =>
    ({ type: "contains", pattern } as const),

  notContains: (pattern: string | RegExp) =>
    ({ type: "not-contains", pattern } as const),

  toolCalled: (toolName: string) =>
    ({ type: "tool-called", toolName } as const),

  toolNotCalled: (toolName: string) =>
    ({ type: "tool-not-called", toolName } as const),

  toolCalledWith: (toolName: string, schema: z.ZodType<unknown>) =>
    ({ type: "tool-called-with", toolName, schema } as const),

  latency: (thresholdMs: number) =>
    ({ type: "latency", thresholdMs } as const),

  tokenUsage: (maxTokens: number) =>
    ({ type: "token-usage", maxTokens } as const),
};
