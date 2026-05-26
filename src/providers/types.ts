import type { AgentInput, AgentOutput } from "../types.js";

export interface AgentProvider {
  readonly name: string;
  run(input: AgentInput, signal?: AbortSignal): Promise<AgentOutput>;
}
