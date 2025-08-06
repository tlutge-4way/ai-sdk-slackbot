import { Agent, ToolAgent } from "./types";
import { ChatAgent } from "./chat-agent";
import { SupervisorAgent } from "./supervisor-agent";
import { PerplexityAgent } from "./tool-agents/perplexity-agent";
import { ThreadAgent } from "./tool-agents/thread-agent";
import { WeatherAgent } from "./tool-agents/weather-agent";

export class AgentRegistry {
  private agents: Map<string, Agent> = new Map();
  private toolAgents: Map<string, ToolAgent> = new Map();

  constructor() {
    this.initialize();
  }

  private initialize() {
    // Register chat agent
    const chatAgent = new ChatAgent();
    this.agents.set(chatAgent.name, chatAgent);

    // Register tool agents
    const toolAgentInstances = [
      new PerplexityAgent(),
      new ThreadAgent(),
      new WeatherAgent(),
    ];

    for (const agent of toolAgentInstances) {
      this.toolAgents.set(agent.name, agent);
      this.agents.set(agent.name, agent);
    }

    // Register supervisor agent (needs registry reference)
    const supervisorAgent = new SupervisorAgent(this);
    this.agents.set(supervisorAgent.name, supervisorAgent);
  }

  getAgent(name: string): Agent | undefined {
    return this.agents.get(name);
  }

  getToolAgents(): ToolAgent[] {
    return Array.from(this.toolAgents.values());
  }

  getChatAgent(): Agent {
    return this.agents.get("ChatAgent")!;
  }

  getSupervisorAgent(): Agent {
    return this.agents.get("SupervisorAgent")!;
  }
}
