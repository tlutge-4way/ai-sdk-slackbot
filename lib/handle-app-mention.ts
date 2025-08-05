import { AppMentionEvent } from "@slack/web-api";
import {
  client,
  getThreadWithPermissionCheck,
  isSummarizationRequest,
} from "./slack-utils";
import { generateResponse } from "./generate-response";
import { summarizeThread } from "./thread-summarizer";
import { parseSlackLink } from "./thread-copier";

// Add function to detect copy thread requests
function isCopyThreadRequest(text: string): boolean {
  const copyPatterns = [
    /copy.*thread/i,
    /migrate.*thread/i,
    /move.*thread/i,
    /transfer.*discussion/i,
    /share.*thread/i,
  ];

  // Check if message contains Slack links
  const hasSlackLinks = text.includes("slack.com/archives/");

  return hasSlackLinks && copyPatterns.some((pattern) => pattern.test(text));
}

const updateStatusUtil = async (
  initialStatus: string,
  event: AppMentionEvent
) => {
  const initialMessage = await client.chat.postMessage({
    channel: event.channel,
    thread_ts: event.thread_ts ?? event.ts,
    text: initialStatus,
  });

  if (!initialMessage || !initialMessage.ts)
    throw new Error("Failed to post initial message");

  const updateMessage = async (status: string) => {
    await client.chat.update({
      channel: event.channel,
      ts: initialMessage.ts as string,
      text: status,
    });
  };
  return updateMessage;
};

export async function handleNewAppMention(
  event: AppMentionEvent,
  botUserId: string
) {
  console.log("Handling app mention");
  if (event.bot_id || event.bot_id === botUserId || event.bot_profile) {
    console.log("Skipping app mention");
    return;
  }

  const { thread_ts, channel, text } = event;
  const updateMessage = await updateStatusUtil("is thinking...", event);

  try {
    // Check if this is a copy thread request
    if (isCopyThreadRequest(text)) {
      await updateMessage("🔍 Processing thread copy request...");

      // Extract Slack links from the message
      const linkPattern =
        /https:\/\/[\w-]+\.slack\.com\/archives\/[A-Z0-9]+\/p\d+/g;
      const links = text.match(linkPattern);

      if (!links || links.length < 2) {
        await updateMessage(
          "📋 **How to copy a thread:**\n\n" +
            "1. Right-click on any message in the source thread and select 'Copy link'\n" +
            "2. Go to the destination channel and copy its link\n" +
            "3. Use this format:\n" +
            "```@Vercel Bot copy thread from [source-link] to [destination-link]```\n\n" +
            "Example:\n" +
            "`@Vercel Bot copy thread from https://workspace.slack.com/archives/C123/p456 to https://workspace.slack.com/archives/C789/p012`"
        );
        return;
      }

      // Let the AI handle the actual copying with the tool
      const result = await generateResponse(
        [{ role: "user", content: text }],
        updateMessage
      );
      await updateMessage(result);
    } else if (thread_ts && isSummarizationRequest(text)) {
      // Handle summarization requests (existing code)
      await updateMessage("📊 Analyzing thread...");

      const { messages, hasFullAccess, error } =
        await getThreadWithPermissionCheck(channel, thread_ts, botUserId);

      if (error && messages.length === 0) {
        await updateMessage(
          `⚠️ ${error}\n\n` +
            `To enable thread summarization in channels, please:\n` +
            `1. Go to your Slack app settings\n` +
            `2. Add these OAuth scopes: \`channels:history\`, \`groups:history\`\n` +
            `3. Reinstall the app to your workspace\n\n` +
            `Alternatively, you can use this feature in direct messages where it works without additional permissions.`
        );
        return;
      }

      const summary = await summarizeThread(messages, text);
      await updateMessage(summary);
    } else if (thread_ts) {
      // Regular threaded conversation
      const { messages } = await getThreadWithPermissionCheck(
        channel,
        thread_ts,
        botUserId
      );
      const result = await generateResponse(messages, updateMessage);
      await updateMessage(result);
    } else {
      // New conversation (not in a thread)
      const result = await generateResponse(
        [{ role: "user", content: text }],
        updateMessage
      );
      await updateMessage(result);
    }
  } catch (error) {
    console.error("Error in handleNewAppMention:", error);
    await updateMessage(
      "Sorry, I encountered an error processing your request."
    );
  }
}
