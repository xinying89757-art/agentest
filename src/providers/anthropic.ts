import Anthropic from "@anthropic-ai/sdk";
import type { AgentInput, AgentOutput, Message, ToolCall } from "../types.js";
import type { AgentProvider } from "./types.js";

export interface AnthropicProviderOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 4096;

export class AnthropicProvider implements AgentProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(options: AnthropicProviderOptions = {}) {
    this.client = new Anthropic({
      apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
    this.model = options.model ?? DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async run(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();

    const systemPrompt = input.systemPrompt;
    const messages = input.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const anthropicTools = input.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: "object" as const,
        properties: t.parameters as Record<string, unknown>,
        required: Object.keys(t.parameters),
      },
    }));

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages: messages as Anthropic.MessageParam[],
      tools: anthropicTools as Anthropic.Tool[],
    });

    const durationMs = Date.now() - startTime;

    const responseMessages: Message[] = [
      ...input.messages,
      ...response.content
        .filter((c) => c.type === "text")
        .map((c) => ({ role: "assistant" as const, content: c.text })),
    ];

    const toolCalls: ToolCall[] = response.content
      .filter((c) => c.type === "tool_use")
      .map((c) => ({
        name: c.name,
        arguments: c.input as Record<string, unknown>,
      }));

    return {
      messages: responseMessages,
      toolCalls,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      durationMs,
    };
  }
}
