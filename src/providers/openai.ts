import type { AgentInput, AgentOutput, Message, ToolCall } from "../types.js";
import type { AgentProvider } from "./types.js";

export interface OpenAIProviderOptions {
  apiKey?: string;
  /**
   * Base URL for the OpenAI-compatible API endpoint.
   * Defaults to "https://api.openai.com/v1".
   *
   * Set this to use any OpenAI-compatible provider:
   * - DeepSeek:  "https://api.deepseek.com/v1"
   * - Qwen:      "https://dashscope.aliyuncs.com/compatible-mode/v1"
   * - Ollama:    "http://localhost:11434/v1"
   * - Azure:     "https://<resource>.openai.azure.com/openai/deployments/<deploy>"
   *
   * @example
   * new OpenAIProvider({ baseURL: "https://api.deepseek.com/v1", model: "deepseek-chat" })
   */
  baseURL?: string;
  model?: string;
  maxTokens?: number;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_MAX_TOKENS = 4096;

// Minimal type shapes for the OpenAI chat completions API.
// We avoid importing the full openai SDK as a hard dependency so that users
// who only need Anthropic don't need to install it.

interface OAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

interface OAIResponse {
  choices: {
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }[];
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export class OpenAIProvider implements AgentProvider {
  readonly name = "openai";
  private apiKey: string;
  private baseURL: string;
  private model: string;
  private maxTokens: number;

  constructor(options: OpenAIProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.baseURL = (options.baseURL ?? process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL).replace(
      /\/$/,
      "",
    );
    this.model = options.model ?? DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async run(input: AgentInput, signal?: AbortSignal): Promise<AgentOutput> {
    const startTime = Date.now();

    const messages: OAIMessage[] = [];

    if (input.systemPrompt) {
      messages.push({ role: "system", content: input.systemPrompt });
    }

    for (const m of input.messages) {
      if (m.role === "system") continue; // already handled above
      messages.push({ role: m.role as "user" | "assistant", content: m.content });
    }

    const tools: OAITool[] | undefined = input.tools?.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: "object",
          properties: t.parameters,
          required: Object.keys(t.parameters),
        },
      },
    }));

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages,
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as OAIResponse;
    const choice = data.choices[0];
    const msg = choice.message;

    const durationMs = Date.now() - startTime;

    // Build the output messages list (append the assistant turn).
    const responseMessages: Message[] = [
      ...input.messages,
      ...(msg.content ? [{ role: "assistant" as const, content: msg.content }] : []),
    ];

    const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((tc) => ({
      name: tc.function.name,
      arguments: (() => {
        try {
          return JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          return {} as Record<string, unknown>;
        }
      })(),
    }));

    return {
      messages: responseMessages,
      toolCalls,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      },
      durationMs,
    };
  }
}
