// SIMPLEST WORKING VERSION FOR AI SDK v5 BETA
// This removes the tool() wrapper which is causing issues

// lib/generate-response.ts
import { perplexity } from "@ai-sdk/perplexity";
import { openai } from "@ai-sdk/openai";
import { CoreMessage, generateText } from "ai";
import { z } from "zod";
import { exa } from "./utils";
import { copyThread } from "./thread-copier";
import { getThreadWithPermissionCheck } from "./slack-utils";
import { summarizeThread } from "./thread-summarizer";

import { AgentOrchestrator } from "./agents/orchestrator";

const orchestrator = new AgentOrchestrator();

export const generateResponse = async (
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
  context?: { channel?: string; threadTs?: string; botUserId?: string }
) => {
  const agentContext = {
    ...context,
    updateStatus,
  };

  return orchestrator.processMessage(messages, agentContext);
};
