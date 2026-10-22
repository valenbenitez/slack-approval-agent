import { WorkflowAgent } from "@ai-sdk/workflow";
import { AGENT_INSTRUCTIONS } from "@/lib/agent/instructions";
import { agentTools } from "@/lib/agent/tools";

export function createAgent() {
  return new WorkflowAgent({
    model: process.env.AI_MODEL || "minimax/minimax-m3.1-flash",
    instructions: AGENT_INSTRUCTIONS,
    tools: agentTools,
  });
}
