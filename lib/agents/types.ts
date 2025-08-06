import { CoreMessage } from "ai";

export interface AgentContext {
  channel?: string;
  threadTs?: string;
  botUserId?: string;
  user?: string;
  updateStatus?: (status: string) => void;
}

export interface AgentResponse {
  success: boolean;
  message: string;
  data?: any;
  requiresEscalation?: boolean;
  suggestedAgent?: string;
}

export interface Agent {
  name: string;
  description: string;
  model?: string;
  canHandle: (query: string, context: AgentContext) => Promise<boolean>;
  execute: (
    messages: CoreMessage[],
    context: AgentContext
  ) => Promise<AgentResponse>;
}

export interface ToolAgent extends Agent {
  tools: string[];
}
