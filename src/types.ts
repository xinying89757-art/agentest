import type { z } from "zod";

// ─── Messages & Tools ───

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// ─── Agent I/O ───

export interface AgentInput {
  systemPrompt?: string;
  messages: Message[];
  tools?: ToolDefinition[];
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface AgentOutput {
  messages: Message[];
  toolCalls: ToolCall[];
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
}

// ─── Assertions ───

export interface SchemaMatchAssertion {
  type: "schema-match";
  schema: z.ZodType<unknown>;
}

export interface ContainsAssertion {
  type: "contains";
  pattern: string | RegExp;
}

export interface NotContainsAssertion {
  type: "not-contains";
  pattern: string | RegExp;
}

export interface ToolCalledAssertion {
  type: "tool-called";
  toolName: string;
}

export interface ToolNotCalledAssertion {
  type: "tool-not-called";
  toolName: string;
}

export interface LatencyAssertion {
  type: "latency";
  thresholdMs: number;
}

export interface TokenUsageAssertion {
  type: "token-usage";
  maxTokens: number;
}

export type Assertion =
  | SchemaMatchAssertion
  | ContainsAssertion
  | NotContainsAssertion
  | ToolCalledAssertion
  | ToolNotCalledAssertion
  | LatencyAssertion
  | TokenUsageAssertion;

// ─── Assertion Result ───

export interface AssertionResult {
  name: string;
  passed: boolean;
  reason: string;
}

// ─── Test Case ───

export interface TestCase {
  name: string;
  input: AgentInput;
  assertions: Assertion[];
  skip?: boolean;
  only?: boolean;
}

// ─── Suite ───

export interface TestSuite {
  name: string;
  cases: TestCase[];
}

// ─── Run Result ───

export interface RunResult {
  testName: string;
  passed: boolean;
  assertions: AssertionResult[];
  durationMs: number;
  agentOutput?: AgentOutput;
}

export interface SuiteResult {
  suiteName: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  results: RunResult[];
  durationMs: number;
}
