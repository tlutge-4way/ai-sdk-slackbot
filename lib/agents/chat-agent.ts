import { openai } from "@ai-sdk/openai";
import { CoreMessage, generateText } from "ai";
import { Agent, AgentContext, AgentResponse } from "./types";

export class ChatAgent implements Agent {
  name = "ChatAgent";
  description = "Primary chat agent for basic queries and routing";
  model = "gpt-4o-mini"; // Smaller, faster model for initial responses

  async canHandle(query: string, context: AgentContext): Promise<boolean> {
    // Chat agent handles everything initially
    return true;
  }

  async execute(
    messages: CoreMessage[],
    context: AgentContext
  ): Promise<AgentResponse> {
    try {
      // Determine if this needs escalation to supervisor
      const needsEscalation = await this.checkIfNeedsEscalation(messages);

      if (needsEscalation.escalate) {
        return {
          success: true,
          message: "",
          requiresEscalation: true,
          suggestedAgent: needsEscalation.suggestedAgent,
        };
      }

      // Handle basic query directly
      const { text } = await generateText({
        model: openai(this.model),
        system: `You are a helpful Slack assistant. Handle basic greetings, simple questions, and general chat.
        For complex queries requiring tools or detailed analysis, you will escalate to specialized agents.
        Keep responses concise and friendly.
        Current date: ${new Date().toISOString().split("T")[0]}`,
        messages,
      });

      return {
        success: true,
        message: this.formatForSlack(text),
      };
    } catch (error) {
      console.error("ChatAgent error:", error);
      return {
        success: false,
        message: "I encountered an error processing your request.",
      };
    }
  }

  private async checkIfNeedsEscalation(
    messages: CoreMessage[]
  ): Promise<{ escalate: boolean; suggestedAgent?: string }> {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== "user") {
      return { escalate: false };
    }

    const query = lastMessage.content as string;
    const lowerQuery = query.toLowerCase();

    // Patterns that need escalation
    const escalationPatterns = [
      { pattern: /summar(ize|ise|y)/i, agent: "SupervisorAgent" },
      { pattern: /copy.*thread/i, agent: "SupervisorAgent" },
      { pattern: /weather/i, agent: "SupervisorAgent" },
      { pattern: /search|find.*web|google/i, agent: "SupervisorAgent" },
      { pattern: /analyze|investigate|research/i, agent: "SupervisorAgent" },
      {
        pattern: /\bhow\b.*\bdo\b|\bwhat\b.*\bis\b/i,
        agent: "SupervisorAgent",
      },
      { pattern: /slack\.com\/archives/i, agent: "SupervisorAgent" }, // Slack links
    ];

    for (const { pattern, agent } of escalationPatterns) {
      if (pattern.test(query)) {
        return { escalate: true, suggestedAgent: agent };
      }
    }

    // Use AI to determine if escalation is needed for ambiguous cases
    try {
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        system: `Determine if this query needs specialized tools or complex analysis.
        Respond with JSON: {"escalate": boolean, "reason": "string"}`,
        prompt: `Query: "${query}"
        
        Should escalate if:
        - Needs web search or current information
        - Requires thread operations (copy, summarize)
        - Needs weather data
        - Requires complex analysis or reasoning
        - Involves multiple steps or tool usage
        
        Should NOT escalate if:
        - Simple greeting or chat
        - Basic factual question you can answer
        - Simple acknowledgment`,
      });

      const decision = JSON.parse(text);
      return {
        escalate: decision.escalate,
        suggestedAgent: decision.escalate ? "SupervisorAgent" : undefined,
      };
    } catch {
      // If unsure, don't escalate
      return { escalate: false };
    }
  }

  private formatForSlack(text: string): string {
    return text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");
  }
}
