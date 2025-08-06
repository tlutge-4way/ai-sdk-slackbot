import { perplexity } from "@ai-sdk/perplexity";
import { CoreMessage, generateText, tool } from "ai";
import { z } from "zod";
import { ToolAgent, AgentContext, AgentResponse } from "../types";

export class PerplexityAgent implements ToolAgent {
  name = "PerplexityAgent";
  description = "Web search and current information retrieval";
  tools = ["web_search"];
  model = "sonar-pro";

  async canHandle(query: string, context: AgentContext): Promise<boolean> {
    const patterns = [
      /search/i,
      /latest|recent|current|today/i,
      /news/i,
      /what.*happening/i,
    ];
    return patterns.some((p) => p.test(query));
  }

  async execute(
    messages: CoreMessage[],
    context: AgentContext
  ): Promise<AgentResponse> {
    try {
      context.updateStatus?.("🔍 Searching the web...");

      const { text } = await generateText({
        model: perplexity(this.model),
        system: `You are a web search specialist. 
        Use your built-in web search capabilities to find current information.
        Always cite sources and provide recent, accurate information.
        Current date: ${new Date().toISOString().split("T")[0]}`,
        messages,
      });

      return {
        success: true,
        message: this.formatForSlack(text),
        data: { source: "perplexity_search" },
      };
    } catch (error) {
      console.error("PerplexityAgent error:", error);
      return {
        success: false,
        message: "Failed to search the web.",
      };
    }
  }

  private formatForSlack(text: string): string {
    return text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");
  }
}
