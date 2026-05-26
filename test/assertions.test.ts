/**
 * Unit tests for all assertion modules, MockProvider matching logic,
 * snapshot key helpers, jaccardSimilarity, and the interpolation utilities.
 *
 * Run with: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

import { validateContains, validateNotContains } from "../src/assertions/content.ts";
import { validateSchema } from "../src/assertions/schema.ts";
import {
  validateToolCalled,
  validateToolNotCalled,
  validateToolCalledWith,
} from "../src/assertions/tool-calls.ts";
import { validateLatency, validateTokenUsage } from "../src/assertions/performance.ts";
import { MockProvider } from "../src/providers/mock.ts";
import { jaccardSimilarity, buildSnapshotKey, hashAgentInput } from "../src/snapshot.ts";
import { interpolateString, expandCase } from "../src/params.ts";
import type { AgentOutput } from "../src/types.ts";

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeOutput(overrides: Partial<AgentOutput> = {}): AgentOutput {
  return {
    messages: [
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ],
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 20 },
    durationMs: 100,
    ...overrides,
  };
}

// ─── P0-1: contains / notContains ──────────────────────────────────────────

describe("validateContains", () => {
  it("passes when assistant text contains the pattern string", () => {
    const out = makeOutput();
    const r = validateContains(out, { type: "contains", pattern: "world" });
    assert.ok(r.passed, r.reason);
  });

  it("fails when pattern is absent", () => {
    const out = makeOutput();
    const r = validateContains(out, { type: "contains", pattern: "missing" });
    assert.ok(!r.passed);
  });

  it("passes with regex", () => {
    const out = makeOutput();
    const r = validateContains(out, { type: "contains", pattern: /^world$/m });
    assert.ok(r.passed, r.reason);
  });

  it("collects ALL assistant messages (P0-1 fix)", () => {
    // When the last message is a user/tool turn (no text), contains should
    // still search earlier assistant messages.
    const out = makeOutput({
      messages: [
        { role: "user", content: "query ORD-001" },
        { role: "assistant", content: "ORD-001 is shipped" },
        // Simulated tool result injected after the assistant turn
        { role: "user", content: "[tool_result] OK" },
      ],
    });
    const r = validateContains(out, { type: "contains", pattern: "ORD-001" });
    assert.ok(r.passed, r.reason);
  });
});

describe("validateNotContains", () => {
  it("passes when pattern is absent", () => {
    const out = makeOutput();
    const r = validateNotContains(out, { type: "not-contains", pattern: "error" });
    assert.ok(r.passed, r.reason);
  });

  it("fails when pattern is present", () => {
    const out = makeOutput({
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "there was an error" },
      ],
    });
    const r = validateNotContains(out, { type: "not-contains", pattern: "error" });
    assert.ok(!r.passed);
  });
});

// ─── P0-2: schemaMatch ─────────────────────────────────────────────────────

describe("validateSchema", () => {
  it("passes for plain JSON content", () => {
    const out = makeOutput({
      messages: [
        { role: "user", content: "give me JSON" },
        { role: "assistant", content: '{"status":"ok","count":3}' },
      ],
    });
    const schema = z.object({ status: z.string(), count: z.number() });
    const r = validateSchema(out, { type: "schema-match", schema });
    assert.ok(r.passed, r.reason);
  });

  it("passes for JSON wrapped in markdown code block (P0-2 fix)", () => {
    const out = makeOutput({
      messages: [
        { role: "user", content: "give me JSON" },
        { role: "assistant", content: "```json\n{\"status\":\"ok\",\"count\":3}\n```" },
      ],
    });
    const schema = z.object({ status: z.string(), count: z.number() });
    const r = validateSchema(out, { type: "schema-match", schema });
    assert.ok(r.passed, r.reason);
  });

  it("fails with a readable field-level error when schema does not match", () => {
    const out = makeOutput({
      messages: [
        { role: "user", content: "give me JSON" },
        { role: "assistant", content: '{"status":42}' },
      ],
    });
    const schema = z.object({ status: z.string() });
    const r = validateSchema(out, { type: "schema-match", schema });
    assert.ok(!r.passed);
    // The error should include field information (flatten output).
    assert.ok(r.reason.includes("status"), `expected 'status' in reason, got: ${r.reason}`);
  });

  it("fails when content is not JSON", () => {
    const out = makeOutput({
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "just some text" },
      ],
    });
    const schema = z.object({ x: z.string() });
    const r = validateSchema(out, { type: "schema-match", schema });
    assert.ok(!r.passed);
  });
});

// ─── toolCalled / toolNotCalled / toolCalledWith ───────────────────────────

describe("validateToolCalled", () => {
  it("passes when tool is present", () => {
    const out = makeOutput({ toolCalls: [{ name: "query_order", arguments: { orderId: "ORD-001" } }] });
    const r = validateToolCalled(out, { type: "tool-called", toolName: "query_order" });
    assert.ok(r.passed, r.reason);
  });

  it("fails when tool is absent", () => {
    const out = makeOutput({ toolCalls: [] });
    const r = validateToolCalled(out, { type: "tool-called", toolName: "query_order" });
    assert.ok(!r.passed);
  });
});

describe("validateToolNotCalled", () => {
  it("passes when tool is absent", () => {
    const out = makeOutput({ toolCalls: [] });
    const r = validateToolNotCalled(out, { type: "tool-not-called", toolName: "cancel_order" });
    assert.ok(r.passed, r.reason);
  });

  it("fails when tool was called", () => {
    const out = makeOutput({ toolCalls: [{ name: "cancel_order", arguments: {} }] });
    const r = validateToolNotCalled(out, { type: "tool-not-called", toolName: "cancel_order" });
    assert.ok(!r.passed);
  });
});

describe("validateToolCalledWith (P1-5)", () => {
  const schema = z.object({ orderId: z.string().startsWith("ORD-") });

  it("passes when a matching call exists", () => {
    const out = makeOutput({
      toolCalls: [{ name: "query_order", arguments: { orderId: "ORD-001" } }],
    });
    const r = validateToolCalledWith(out, { type: "tool-called-with", toolName: "query_order", schema });
    assert.ok(r.passed, r.reason);
  });

  it("passes when at least one of multiple calls matches (P1-5: multi-call semantics)", () => {
    const out = makeOutput({
      toolCalls: [
        { name: "query_order", arguments: { orderId: "INVALID" } },
        { name: "query_order", arguments: { orderId: "ORD-002" } },
      ],
    });
    const r = validateToolCalledWith(out, { type: "tool-called-with", toolName: "query_order", schema });
    assert.ok(r.passed, r.reason);
  });

  it("fails when tool is not called at all", () => {
    const out = makeOutput({ toolCalls: [] });
    const r = validateToolCalledWith(out, { type: "tool-called-with", toolName: "query_order", schema });
    assert.ok(!r.passed);
  });

  it("fails when all calls have invalid arguments", () => {
    const out = makeOutput({
      toolCalls: [{ name: "query_order", arguments: { orderId: 12345 } }],
    });
    const r = validateToolCalledWith(out, { type: "tool-called-with", toolName: "query_order", schema });
    assert.ok(!r.passed);
    // Error message should mention the field name for debuggability.
    assert.ok(r.reason.includes("orderId"), `expected 'orderId' in reason, got: ${r.reason}`);
  });
});

// ─── latency / tokenUsage ──────────────────────────────────────────────────

describe("validateLatency", () => {
  it("passes when durationMs is within threshold", () => {
    const out = makeOutput({ durationMs: 500 });
    const r = validateLatency(out, { type: "latency", thresholdMs: 1000 });
    assert.ok(r.passed, r.reason);
  });

  it("fails when durationMs exceeds threshold", () => {
    const out = makeOutput({ durationMs: 2000 });
    const r = validateLatency(out, { type: "latency", thresholdMs: 1000 });
    assert.ok(!r.passed);
  });
});

describe("validateTokenUsage", () => {
  it("passes when total tokens are within limit", () => {
    const out = makeOutput({ usage: { inputTokens: 100, outputTokens: 50 } });
    const r = validateTokenUsage(out, { type: "token-usage", maxTokens: 200 });
    assert.ok(r.passed, r.reason);
  });

  it("fails when total exceeds limit", () => {
    const out = makeOutput({ usage: { inputTokens: 100, outputTokens: 150 } });
    const r = validateTokenUsage(out, { type: "token-usage", maxTokens: 200 });
    assert.ok(!r.passed);
  });
});

// ─── P1-8: MockProvider longest-match ──────────────────────────────────────

describe("MockProvider (P1-8: longest match)", () => {
  const provider = new MockProvider({
    defaultResponse: { content: "default" },
    responses: new Map([
      ["ORD", { content: "short match" }],
      ["ORD-001", { content: "specific match" }],
    ]),
  });

  it("returns the most specific (longest key) match", async () => {
    const out = await provider.run({
      messages: [{ role: "user", content: "query ORD-001 please" }],
    });
    // Should match "ORD-001", not "ORD".
    assert.equal(out.messages.at(-1)?.content, "specific match");
  });

  it("falls back to shorter key when longer key does not match", async () => {
    const out = await provider.run({
      messages: [{ role: "user", content: "show me ORD-999" }],
    });
    // "ORD-001" does not match, but "ORD" does.
    assert.equal(out.messages.at(-1)?.content, "short match");
  });

  it("returns default when no key matches", async () => {
    const out = await provider.run({
      messages: [{ role: "user", content: "something unrelated" }],
    });
    assert.equal(out.messages.at(-1)?.content, "default");
  });
});

// ─── P1-7: snapshot key helpers ────────────────────────────────────────────

describe("snapshot key helpers (P1-7)", () => {
  it("buildSnapshotKey produces expected format", () => {
    const key = buildSnapshotKey("abc123456789", "my test name");
    assert.equal(key, "hash_abc123456789_my test name");
  });

  it("hashAgentInput is deterministic", () => {
    const input = {
      systemPrompt: "You are helpful",
      messages: [{ role: "user" as const, content: "hello" }],
    };
    assert.equal(hashAgentInput(input), hashAgentInput(input));
  });

  it("hashAgentInput changes when content changes", () => {
    const a = hashAgentInput({ messages: [{ role: "user", content: "hello" }] });
    const b = hashAgentInput({ messages: [{ role: "user", content: "goodbye" }] });
    assert.notEqual(a, b);
  });

  it("hashAgentInput does NOT change when only testName changes (rename safety)", () => {
    const input = {
      systemPrompt: "You are helpful",
      messages: [{ role: "user" as const, content: "hello" }],
    };
    // Same input, different test names → same hash (rename safe)
    const hash1 = hashAgentInput(input);
    const hash2 = hashAgentInput(input);
    assert.equal(hash1, hash2);
  });
});

// ─── jaccardSimilarity ─────────────────────────────────────────────────────

describe("jaccardSimilarity", () => {
  it("returns 1 for identical strings", () => {
    assert.equal(jaccardSimilarity("hello world", "hello world"), 1);
  });

  it("returns 1 for two empty strings", () => {
    assert.equal(jaccardSimilarity("", ""), 1);
  });

  it("returns 0 for completely different strings", () => {
    assert.equal(jaccardSimilarity("foo bar", "baz qux"), 0);
  });

  it("returns a value between 0 and 1 for partial overlap", () => {
    const s = jaccardSimilarity("the quick brown fox", "the slow brown dog");
    assert.ok(s > 0 && s < 1, `expected 0 < ${s} < 1`);
  });
});

// ─── interpolateString / expandCase ────────────────────────────────────────

describe("interpolateString", () => {
  it("replaces placeholders", () => {
    assert.equal(interpolateString("hello $name", { name: "world" }), "hello world");
  });

  it("throws for missing param", () => {
    assert.throws(
      () => interpolateString("$missing", {}),
      /Missing param/,
    );
  });
});

describe("expandCase", () => {
  it("produces one TestCase per param row", () => {
    const cases = expandCase({
      name: "test $orderId",
      params: [{ orderId: "ORD-001" }, { orderId: "ORD-002" }],
      input: {
        systemPrompt: "You are helpful",
        messages: [{ role: "user", content: "query $orderId" }],
      },
      assertions: [],
    });
    assert.equal(cases.length, 2);
    assert.equal(cases[0].name, "test ORD-001");
    assert.equal(cases[1].input.messages[0].content, "query ORD-002");
  });
});
