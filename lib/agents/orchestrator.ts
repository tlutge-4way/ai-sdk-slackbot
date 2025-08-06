import { CoreMessage } from "ai";
import { AgentContext, AgentResponse } from "./types";
import { AgentRegistry } from "./registry";

export class AgentOrchestrator {
  private registry: AgentRegistry;

  constructor() {
    this.registry = new AgentRegistry();
  }

  async processMessage(
    messages: CoreMessage[],
    context: AgentContext
  ): Promise<string> {
    try {
      // Start with chat agent
      const chatAgent = this.registry.getChatAgent();
      context.updateStatus?.("💭 Processing...");

      const chatResponse = await chatAgent.execute(messages, context);

      // Check if escalation is needed
      if (chatResponse.requiresEscalation) {
        context.updateStatus?.("🤔 Let me think about that...");

        // Escalate to supervisor
        const supervisorAgent = this.registry.getSupervisorAgent();
        const supervisorResponse = await supervisorAgent.execute(
          messages,
          context
        );

        return supervisorResponse.message;
      }

      // Return chat agent's response
      return chatResponse.message;
    } catch (error) {
      console.error("Orchestrator error:", error);
      return "I encountered an error processing your request. Please try again.";
    }
  }
}
