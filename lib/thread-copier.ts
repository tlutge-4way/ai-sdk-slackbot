import { WebClient } from "@slack/web-api";
import { CoreMessage } from "ai";
import { client } from "./slack-utils";

interface ParsedSlackLink {
  teamId?: string;
  channelId: string;
  messageTs: string;
  threadTs?: string;
}

interface ThreadMessage {
  user: string;
  text: string;
  timestamp: string;
  userName?: string;
  isBot: boolean;
}

// Parse Slack links to extract channel and message IDs
export function parseSlackLink(url: string): ParsedSlackLink | null {
  try {
    // Slack link formats:
    // https://workspace.slack.com/archives/C1234567890/p1234567890123456
    // https://workspace.slack.com/archives/C1234567890/p1234567890123456?thread_ts=1234567890.123456

    const linkPattern =
      /https:\/\/[\w-]+\.slack\.com\/archives\/([A-Z0-9]+)\/p(\d+)(\d{6})/;
    const match = url.match(linkPattern);

    if (!match) {
      return null;
    }

    const channelId = match[1];
    const timestampPart1 = match[2];
    const timestampPart2 = match[3];

    // Convert Slack's link timestamp format to API timestamp format
    // p1234567890123456 -> 1234567890.123456
    const messageTs = `${timestampPart1}.${timestampPart2}`;

    // Check for thread_ts in query params
    const threadTsMatch = url.match(/thread_ts=(\d+\.\d+)/);
    const threadTs = threadTsMatch ? threadTsMatch[1] : messageTs;

    return {
      channelId,
      messageTs,
      threadTs,
    };
  } catch (error) {
    console.error("Error parsing Slack link:", error);
    return null;
  }
}

// Get user's display name without @mentioning them
async function getUserName(userId: string): Promise<string> {
  try {
    const result = await client.users.info({ user: userId });
    return result.user?.real_name || result.user?.name || "Unknown User";
  } catch (error) {
    console.error(`Error fetching user info for ${userId}:`, error);
    return "Unknown User";
  }
}

// Format timestamp to readable format
function formatTimestamp(ts: string): string {
  const date = new Date(parseFloat(ts) * 1000);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// Fetch thread messages with user info
export async function fetchThreadWithUserInfo(
  channelId: string,
  threadTs: string
): Promise<{
  messages: ThreadMessage[];
  userNameMap: Map<string, string>;
  error?: string;
}> {
  try {
    const response = await client.conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit: 200, // Get more messages for complete threads
    });

    if (!response.messages || response.messages.length === 0) {
      return {
        messages: [],
        userNameMap: new Map(), // Return empty map if no messages
        error: "No messages found in the thread",
      };
    }

    // Fetch user names for all unique users in parallel
    const userIds = [
      ...new Set(response.messages.map((m) => m.user).filter(Boolean)),
    ];
    const userNameMap = new Map<string, string>();

    await Promise.all(
      userIds.map(async (userId) => {
        if (userId) {
          const name = await getUserName(userId);
          userNameMap.set(userId, name);
        }
      })
    );

    const messages: ThreadMessage[] = response.messages
      .filter((msg) => msg.text) // Only include messages with text
      .map((msg) => {
        const isBot = !!msg.bot_id;
        let userName: string;

        if (isBot) {
          // For bot messages, use msg.username if available, otherwise "Bot"
          userName = msg?.user || "Bot";
        } else {
          // For user messages, get from userNameMap
          userName = (msg.user && userNameMap.get(msg.user)) || "Unknown User";
        }

        return {
          user: msg.user || "bot", // Default to "bot" if user is undefined (for bot messages)
          text: msg.text || "",
          timestamp: msg.ts || "",
          userName: userName,
          isBot: isBot,
        } as ThreadMessage;
      });

    return { messages, userNameMap };
  } catch (error: any) {
    console.error("Error fetching thread:", error);
    return {
      messages: [],
      userNameMap: new Map(), // Return empty map on error
      error: `Failed to fetch thread: ${error.message}`,
    };
  }
}

// Format thread for posting to new channel
export function formatThreadForCopy(
  messages: ThreadMessage[],
  sourceChannelId: string,
  threadTs: string,
  userNameMap: Map<string, string> // Added userNameMap as an argument
): string {
  if (messages.length === 0) {
    return "No messages to copy";
  }

  const firstMessage = messages[0];
  const header =
    `📋 *Thread copied from <#${sourceChannelId}>*\n` +
    `_Original thread started ${formatTimestamp(firstMessage.timestamp)}_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  const formattedMessages = messages
    .map((msg, index) => {
      const nameDisplay = msg.isBot
        ? `🤖 ${msg.userName}`
        : `👤 ${msg.userName}`;
      const timestamp = formatTimestamp(msg.timestamp);

      // Clean up the text - remove bot mentions, format nicely
      let cleanText = msg.text
        .replace(/<@[A-Z0-9]+>/g, (match) => {
          // Resolve user IDs to names using the passed userNameMap
          const userId = match.slice(2, -1);
          return `@${userNameMap.get(userId) || "user"}`;
        })
        .replace(/```/g, "\n```\n") // Better code block formatting
        .trim();

      if (index === 0) {
        // First message - make it stand out
        return `*${nameDisplay}* - ${timestamp}\n${cleanText}`;
      } else {
        // Reply messages - indent slightly
        return `\n*${nameDisplay}* - ${timestamp}\n${cleanText}`;
      }
    })
    .join("\n\n");

  const footer =
    `\n\n━━━━━━━━━━━━━━━━━━━━━━\n` +
    `_Total messages: ${messages.length}_\n` +
    `<https://slack.com/archives/${sourceChannelId}/p${threadTs.replace(
      ".",
      ""
    )}|View original thread>`;

  return header + formattedMessages + footer;
}

// Main function to copy thread
export async function copyThread(
  sourceLink: string,
  destinationLink: string
): Promise<{ success: boolean; message: string; destinationTs?: string }> {
  // Parse the source thread link
  const sourceInfo = parseSlackLink(sourceLink);
  if (!sourceInfo) {
    return {
      success: false,
      message:
        "Invalid source thread link. Please provide a valid Slack thread link.",
    };
  }

  // Parse the destination channel link
  const destInfo = parseSlackLink(destinationLink);
  if (!destInfo) {
    return {
      success: false,
      message:
        "Invalid destination channel link. Please provide a valid Slack channel link.",
    };
  }

  try {
    // Fetch the thread messages and the userNameMap
    const { messages, userNameMap, error } = await fetchThreadWithUserInfo(
      sourceInfo.channelId,
      sourceInfo.threadTs || sourceInfo.messageTs
    );

    if (error || messages.length === 0) {
      return {
        success: false,
        message: error || "No messages found in the source thread",
      };
    }

    // Format the thread for copying, passing the userNameMap
    const formattedThread = formatThreadForCopy(
      messages,
      sourceInfo.channelId,
      sourceInfo.threadTs || sourceInfo.messageTs,
      userNameMap // Pass userNameMap here
    );

    // Post to destination channel
    const result = await client.chat.postMessage({
      channel: destInfo.channelId,
      text: formattedThread,
      unfurl_links: false, // Don't unfurl links to avoid clutter
      unfurl_media: false,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: formattedThread.substring(0, 3000), // Slack block text limit
          },
        },
      ],
    });

    // If the message is too long, send additional messages in thread
    if (formattedThread.length > 3000) {
      const chunks = formattedThread.match(/.{1,3000}/gs) || [];
      for (let i = 1; i < chunks.length; i++) {
        await client.chat.postMessage({
          channel: destInfo.channelId,
          thread_ts: result.ts,
          text: chunks[i],
          unfurl_links: false,
          unfurl_media: false,
        });
      }
    }

    return {
      success: true,
      message: `Successfully copied thread to <#${destInfo.channelId}>`,
      destinationTs: result.ts,
    };
  } catch (error: any) {
    console.error("Error copying thread:", error);
    return {
      success: false,
      message: `Failed to copy thread: ${error.message}`,
    };
  }
}
