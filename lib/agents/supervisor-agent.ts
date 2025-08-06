import { openai } from "@ai-sdk/openai";
import { CoreMessage, generateText } from "ai";
import { Agent, AgentContext, AgentResponse } from "./types";
import { AgentRegistry } from "./registry";

export class SupervisorAgent implements Agent {
  name = "SupervisorAgent";
  description = "Orchestrates specialized agents and handles complex queries";
  model = "gpt-4o"; // More powerful model for complex reasoning

  constructor(private registry: AgentRegistry) {}

  async canHandle(query: string, context: AgentContext): Promise<boolean> {
    // Supervisor can handle any complex query
    return true;
  }

  async execute(
    messages: CoreMessage[],
    context: AgentContext
  ): Promise<AgentResponse> {
    try {
      context.updateStatus?.("🧠 Analyzing request...");

      // Determine which tool agent(s) to use
      const agentPlan = await this.planAgentUsage(messages, context);

      if (agentPlan.agents.length === 0) {
        // Handle directly without tools
        return this.handleDirectly(messages, context);
      }

      // Execute plan with selected agents
      const results: any[] = [];
      for (const agentName of agentPlan.agents) {
        const agent = this.registry.getAgent(agentName);
        if (agent) {
          context.updateStatus?.(`🔧 Using ${agentName}...`);
          const result = await agent.execute(messages, context);
          results.push({
            agent: agentName,
            result: result,
          });
        }
      }

      // Synthesize results
      return this.synthesizeResults(messages, results, context);
    } catch (error) {
      console.error("SupervisorAgent error:", error);
      return {
        success: false,
        message: "I encountered an error coordinating the response.",
      };
    }
  }

  private async planAgentUsage(
    messages: CoreMessage[],
    context: AgentContext
  ): Promise<{ agents: string[] }> {
    const lastMessage = messages[messages.length - 1];
    const query =
      lastMessage.role === "user" ? (lastMessage.content as string) : "";

    // Get available tool agents
    const toolAgents = this.registry.getToolAgents();

    const { text } = await generateText({
      model: openai(this.model),
      system: `You are an intelligent task planner. Analyze the user query and determine which specialized agents should be used.
      
      Available agents:
      ${toolAgents.map((a) => `- ${a.name}: ${a.description}`).join("\n")}
      
      Return JSON with agent names needed: {"agents": ["AgentName1", "AgentName2"]}
      Use multiple agents if the task requires multiple tools.
      Return empty array if no specialized tools are needed.`,
      prompt: `Query: "${query}"
      Context: In ${context.channel ? "channel" : "DM"}, ${
        context.threadTs ? "in thread" : "new message"
      }`,
    });

    try {
      return JSON.parse(text);
    } catch {
      return { agents: [] };
    }
  }

  private async handleDirectly(
    messages: CoreMessage[],
    context: AgentContext
  ): Promise<AgentResponse> {
    const { text } = await generateText({
      model: openai(this.model),
      system: `You are an advanced AI assistant helping in Slack.
      Provide comprehensive, well-reasoned responses.
      Current date: ${new Date().toISOString().split("T")[0]}`,
      messages,
    });

    return {
      success: true,
      message: this.formatForSlack(text),
    };
  }

  private async synthesizeResults(
    messages: CoreMessage[],
    results: any[],
    context: AgentContext
  ): Promise<AgentResponse> {
    // Combine results from multiple agents
    const resultSummary = results
      .map(
        (r) =>
          `${r.agent}: ${JSON.stringify(r.result.data || r.result.message)}`
      )
      .join("\n");

    const { text } = await generateText({
      model: openai(this.model),
      system: `You are synthesizing results from multiple specialized agents.
      Create a cohesive, well-formatted response for the user.
      Format for Slack using markdown where appropriate.`,
      messages: [
        ...messages,
        {
          role: "assistant",
          content: `Tool results:\n${resultSummary}`,
        },
        {
          role: "user",
          content:
            "Please provide a comprehensive response based on these results.",
        },
      ],
    });

    return {
      success: true,
      message: this.formatForSlack(text),
    };
  }

  private formatForSlack(text: string): string {
    return text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");
  }
}
