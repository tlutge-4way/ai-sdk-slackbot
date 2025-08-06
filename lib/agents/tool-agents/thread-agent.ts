import { openai } from "@ai-sdk/openai";
import { CoreMessage, generateText, tool } from "ai";
import { z } from "zod";
import { ToolAgent, AgentContext, AgentResponse } from "../types";
import { copyThread } from "../../thread-copier";
import { summarizeThread } from "../../thread-summarizer";
import { getThreadWithPermissionCheck } from "../../slack-utils";

export class ThreadAgent implements ToolAgent {
  name = "ThreadAgent";
  description = "Thread operations including summarization and copying";
  tools = ["summarize_thread", "copy_thread"];

  async canHandle(query: string, context: AgentContext): Promise<boolean> {
    const patterns = [
      /summar(ize|ise|y)/i,
      /copy.*thread/i,
      /migrate.*thread/i,
      /recap/i,
      /slack\.com\/archives/i,
    ];
    return patterns.some((p) => p.test(query));
  }

  async execute(
    messages: CoreMessage[],
    context: AgentContext
  ): Promise<AgentResponse> {
    const lastMessage = messages[messages.length - 1];
    const query =
      lastMessage.role === "user" ? (lastMessage.content as string) : "";

    // Determine operation type
    if (/copy|migrate|move/i.test(query) && query.includes("slack.com")) {
      return this.handleCopyThread(query, context);
    } else if (/summar|recap/i.test(query)) {
      return this.handleSummarizeThread(messages, context);
    }

    return {
      success: false,
      message: "Could not determine thread operation.",
    };
  }

  private async handleCopyThread(
    query: string,
    context: AgentContext
  ): Promise<AgentResponse> {
    context.updateStatus?.("📋 Copying thread...");

    // Extract Slack links
    const linkPattern =
      /https:\/\/[\w-]+\.slack\.com\/archives\/[A-Z0-9]+\/p\d+/g;
    const links = query.match(linkPattern);

    if (!links || links.length < 2) {
      return {
        success: false,
        message: "Please provide both source and destination Slack links.",
      };
    }

    const result = await copyThread(links[0], links[1]);

    return {
      success: result.success,
      message: result.message,
      data: { operation: "copy_thread", result },
    };
  }

  private async handleSummarizeThread(
    messages: CoreMessage[],
    context: AgentContext
  ): Promise<AgentResponse> {
    if (!context.channel || !context.threadTs || !context.botUserId) {
      return {
        success: false,
        message: "Thread context not available for summarization.",
      };
    }

    context.updateStatus?.("📊 Analyzing thread...");

    const { messages: threadMessages, error } =
      await getThreadWithPermissionCheck(
        context.channel,
        context.threadTs,
        context.botUserId
      );

    if (error && threadMessages.length === 0) {
      return {
        success: false,
        message: `Unable to access thread: ${error}`,
      };
    }

    const summary = await summarizeThread(
      threadMessages,
      "comprehensive summary"
    );

    return {
      success: true,
      message: summary,
      data: {
        operation: "summarize_thread",
        messageCount: threadMessages.length,
      },
    };
  }
}
