import type { AgentInput, AgentOutput } from "../types.js";

export interface AgentProvider {
  readonly name: string;
  run(input: AgentInput): Promise<AgentOutput>;
}
