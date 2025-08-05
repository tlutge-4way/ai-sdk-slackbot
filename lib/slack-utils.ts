import { WebClient } from "@slack/web-api";
import { CoreMessage } from "ai";
import crypto from "crypto";

const signingSecret = process.env.SLACK_SIGNING_SECRET!;

export const client = new WebClient(process.env.SLACK_BOT_TOKEN);

// See https://api.slack.com/authentication/verifying-requests-from-slack
export async function isValidSlackRequest({
  request,
  rawBody,
}: {
  request: Request;
  rawBody: string;
}) {
  // console.log('Validating Slack request')
  const timestamp = request.headers.get("X-Slack-Request-Timestamp");
  const slackSignature = request.headers.get("X-Slack-Signature");
  // console.log(timestamp, slackSignature)

  if (!timestamp || !slackSignature) {
    console.log("Missing timestamp or signature");
    return false;
  }

  // Prevent replay attacks on the order of 5 minutes
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 60 * 5) {
    console.log("Timestamp out of range");
    return false;
  }

  const base = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto
    .createHmac("sha256", signingSecret)
    .update(base)
    .digest("hex");
  const computedSignature = `v0=${hmac}`;

  // Prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(computedSignature),
    Buffer.from(slackSignature)
  );
}

export const verifyRequest = async ({
  requestType,
  request,
  rawBody,
}: {
  requestType: string;
  request: Request;
  rawBody: string;
}) => {
  const validRequest = await isValidSlackRequest({ request, rawBody });
  if (!validRequest || requestType !== "event_callback") {
    return new Response("Invalid request", { status: 400 });
  }
};

export const updateStatusUtil = (channel: string, thread_ts: string) => {
  return async (status: string) => {
    await client.assistant.threads.setStatus({
      channel_id: channel,
      thread_ts: thread_ts,
      status: status,
    });
  };
};
export async function getThreadWithPermissionCheck(
  channel_id: string,
  thread_ts: string,
  botUserId: string
): Promise<{
  messages: CoreMessage[];
  hasFullAccess: boolean;
  error?: string;
}> {
  try {
    // First, check what type of channel this is
    const channelInfo = await client.conversations
      .info({
        channel: channel_id,
      })
      .catch(() => null);

    // Try to get thread messages
    const response = await client.conversations.replies({
      channel: channel_id,
      ts: thread_ts,
      limit: 100, // Increase limit for better summarization
    });

    if (!response.messages || response.messages.length === 0) {
      return {
        messages: [],
        hasFullAccess: false,
        error:
          "Unable to access thread messages. The bot may need additional permissions.",
      };
    }

    // Check if we're getting the full thread or just partial access
    const hasFullAccess =
      response.messages.length > 1 ||
      channelInfo?.channel?.is_im ||
      channelInfo?.channel?.is_mpim;

    const messages = response.messages
      .map((message) => {
        const isBot = !!message.bot_id;
        if (!message.text) return null;

        let content = message.text;
        // Clean up mentions
        if (!isBot && content.includes(`<@${botUserId}>`)) {
          content = content.replace(new RegExp(`<@${botUserId}>\\s*`, "g"), "");
        }

        return {
          role: isBot ? "assistant" : "user",
          content: content,
        } as CoreMessage;
      })
      .filter((msg): msg is CoreMessage => msg !== null);

    return { messages, hasFullAccess };
  } catch (error: any) {
    console.error("Error fetching thread:", error);

    // Specific error handling for missing permissions
    if (error.data?.error === "missing_scope") {
      return {
        messages: [],
        hasFullAccess: false,
        error:
          "Missing required permissions. Please ensure the bot has 'channels:history' and 'groups:history' scopes.",
      };
    }

    return {
      messages: [],
      hasFullAccess: false,
      error: `Failed to fetch thread: ${error.message}`,
    };
  }
}

// Add function to detect summarization requests
export function isSummarizationRequest(text: string): boolean {
  const summarizePatterns = [
    /summar(ize|ise|y)/i,
    /recap/i,
    /tl;?dr/i,
    /what.*discuss/i,
    /overview.*thread/i,
    /catch.*up/i,
  ];

  return summarizePatterns.some((pattern) => pattern.test(text));
}
export async function getThread(
  channel_id: string,
  thread_ts: string,
  botUserId: string
): Promise<CoreMessage[]> {
  const { messages } = await client.conversations.replies({
    channel: channel_id,
    ts: thread_ts,
    limit: 50,
  });

  // Ensure we have messages

  if (!messages) throw new Error("No messages found in thread");

  const result = messages
    .map((message) => {
      const isBot = !!message.bot_id;
      if (!message.text) return null;

      // For app mentions, remove the mention prefix
      // For IM messages, keep the full text
      let content = message.text;
      if (!isBot && content.includes(`<@${botUserId}>`)) {
        content = content.replace(`<@${botUserId}> `, "");
      }

      return {
        role: isBot ? "assistant" : "user",
        content: content,
      } as CoreMessage;
    })
    .filter((msg): msg is CoreMessage => msg !== null);

  return result;
}

export const getBotId = async () => {
  const { user_id: botUserId } = await client.auth.test();

  if (!botUserId) {
    throw new Error("botUserId is undefined");
  }
  return botUserId;
};
