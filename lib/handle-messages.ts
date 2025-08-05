import type {
  AssistantThreadStartedEvent,
  GenericMessageEvent,
} from "@slack/web-api";
import {
  client,
  getThreadWithPermissionCheck,
  updateStatusUtil,
  isSummarizationRequest,
} from "./slack-utils";
import { generateResponse } from "./generate-response";
import { summarizeThread } from "./thread-summarizer";

export async function handleNewAssistantMessage(
  event: GenericMessageEvent,
  botUserId: string
) {
  if (
    event.bot_id ||
    event.bot_id === botUserId ||
    event.bot_profile ||
    !event.thread_ts
  )
    return;

  const { thread_ts, channel, text } = event;
  const updateStatus = updateStatusUtil(channel, thread_ts);
  await updateStatus("is thinking...");

  try {
    // Check if this is a summarization request
    if (text && isSummarizationRequest(text)) {
      await updateStatus("📊 Summarizing thread...");

      const { messages, error } = await getThreadWithPermissionCheck(
        channel,
        thread_ts,
        botUserId
      );

      if (error && messages.length === 0) {
        await client.chat.postMessage({
          channel: channel,
          thread_ts: thread_ts,
          text: `⚠️ ${error}`,
        });
        await updateStatus("");
        return;
      }

      const summary = await summarizeThread(messages, text);

      await client.chat.postMessage({
        channel: channel,
        thread_ts: thread_ts,
        text: summary,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: summary,
            },
          },
        ],
      });
    } else {
      // Regular conversation
      const { messages } = await getThreadWithPermissionCheck(
        channel,
        thread_ts,
        botUserId
      );
      const result = await generateResponse(messages, updateStatus);

      await client.chat.postMessage({
        channel: channel,
        thread_ts: thread_ts,
        text: result,
        unfurl_links: false,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: result,
            },
          },
        ],
      });
    }
  } catch (error) {
    console.error("Error in handleNewAssistantMessage:", error);
    await client.chat.postMessage({
      channel: channel,
      thread_ts: thread_ts,
      text: "Sorry, I encountered an error processing your request.",
    });
  } finally {
    await updateStatus("");
  }
}
