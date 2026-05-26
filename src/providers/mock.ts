import type { AgentInput, AgentOutput, ToolCall } from "../types.js";
import type { AgentProvider } from "./types.js";

export interface MockResponse {
  content: string;
  toolCalls?: ToolCall[];
}

export interface MockProviderOptions {
  defaultResponse: MockResponse;
  responses?: Map<string, MockResponse>;
}

export class MockProvider implements AgentProvider {
  readonly name = "mock";
  private defaultResponse: MockResponse;
  private responses: Map<string, MockResponse>;

  constructor(options: MockProviderOptions) {
    this.defaultResponse = options.defaultResponse;
    this.responses = options.responses ?? new Map();
  }

  // signal is accepted to satisfy the AgentProvider interface but is not
  // needed here since MockProvider performs no network I/O.
  async run(input: AgentInput, _signal?: AbortSignal): Promise<AgentOutput> {
    const lastUserMessage = input.messages
      .filter((m) => m.role === "user")
      .at(-1)
      ?.content ?? "";

    const response = this.findResponse(lastUserMessage);

    return {
      messages: [
        ...input.messages,
        { role: "assistant", content: response.content },
      ],
      toolCalls: response.toolCalls ?? [],
      usage: { inputTokens: 0, outputTokens: 0 },
      durationMs: 1,
    };
  }

  private findResponse(message: string): MockResponse {
    // Collect all matching keys, then pick the longest one.
    // This prevents short keys (e.g. "ORD") from shadowing more-specific longer
    // keys (e.g. "ORD-001") when both appear in responses, making matching
    // deterministic regardless of insertion order.
    let bestKey = "";
    let bestValue: MockResponse | undefined;

    for (const [key, value] of this.responses) {
      if (message.includes(key) && key.length > bestKey.length) {
        bestKey = key;
        bestValue = value;
      }
    }

    return bestValue ?? this.defaultResponse;
  }
}
