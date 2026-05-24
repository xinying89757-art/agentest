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

  async run(input: AgentInput): Promise<AgentOutput> {
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
    for (const [key, value] of this.responses) {
      if (message.includes(key)) return value;
    }
    return this.defaultResponse;
  }
}
