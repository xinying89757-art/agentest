import { z } from "zod";
import { suite, assertions } from "../dist/index.js";

export default suite({
  name: "Customer Service Agent",

  cases: [
    // ─── Parameterized: one template, multiple order IDs ───
    {
      name: "query $orderId → calls query_order and returns $expected",
      params: [
        { orderId: "ORD-001", expected: "business days" },
        { orderId: "ORD-002", expected: "shipped" },
        { orderId: "ORD-999", expected: "double-check" },
      ],
      input: {
        systemPrompt:
          "You are a customer service agent. Use the query_order tool to look up order details.",
        messages: [
          { role: "user", content: "What is the status of order $orderId?" },
        ],
        tools: [
          {
            name: "query_order",
            description: "Look up an order by ID",
            parameters: {},
          },
        ],
      },
      assertions: [
        assertions.toolCalled("query_order"),
        assertions.contains("$orderId"),
        assertions.contains("$expected"),
        assertions.latency(10000),
      ],
    },

    // ─── Regular test cases ───
    {
      name: "queries order tool for valid order ID",
      input: {
        systemPrompt:
          "You are a customer service agent. Use the query_order tool to look up order details. Never use cancel_order unless explicitly asked.",
        messages: [
          { role: "user", content: "What is the status of order ORD-001?" },
        ],
        tools: [
          {
            name: "query_order",
            description: "Look up an order by ID",
            parameters: { orderId: "ORD-001" },
          },
          {
            name: "cancel_order",
            description: "Cancel an order by ID",
            parameters: { orderId: "CANCEL-001" },
          },
        ],
      },
      assertions: [
        assertions.toolCalled("query_order"),
        assertions.toolNotCalled("cancel_order"),
        assertions.contains("ORD-001"),
        assertions.latency(10000),
        assertions.tokenUsage(100000),
      ],
    },

    {
      name: "handles non-existent order gracefully",
      input: {
        systemPrompt:
          "You are a customer service agent. Use query_order to look up orders. If an order does not exist, tell the user politely.",
        messages: [
          { role: "user", content: "Find order ORD-999" },
        ],
        tools: [
          {
            name: "query_order",
            description: "Look up an order by ID",
            parameters: { orderId: "ORD-999" },
          },
        ],
      },
      assertions: [
        assertions.toolCalled("query_order"),
        assertions.notContains("error"),
        assertions.notContains("exception"),
      ],
    },

    {
      name: "refuses to cancel without explicit request",
      input: {
        systemPrompt:
          "You are a customer service agent. Only use cancel_order when the user explicitly asks to cancel. Do not cancel on vague requests.",
        messages: [
          { role: "user", content: "I'm unhappy with my order." },
        ],
        tools: [
          {
            name: "query_order",
            description: "Look up an order by ID",
            parameters: {},
          },
          {
            name: "cancel_order",
            description: "Cancel an order",
            parameters: {},
          },
        ],
      },
      assertions: [
        assertions.toolNotCalled("cancel_order"),
        assertions.latency(10000),
      ],
    },

    {
      name: "returns structured JSON when asked for order summary",
      skip: false,
      input: {
        systemPrompt:
          'You are a customer service agent. When asked for an order summary, respond with JSON: {"orderId": "...", "status": "...", "items": 0}.',
        messages: [
          { role: "user", content: "Give me a summary of order ORD-050" },
        ],
      },
      assertions: [
        assertions.schemaMatch(
          z.object({
            orderId: z.string(),
            status: z.string(),
            items: z.number(),
          })
        ),
      ],
    },
  ],
});
