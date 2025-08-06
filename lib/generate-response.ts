import { openai } from "@ai-sdk/openai";
import { CoreMessage, generateText, tool } from "ai";
import { z } from "zod";
import { exa } from "./utils";
import { copyThread } from "./thread-copier";
import { getThreadWithPermissionCheck } from "./slack-utils";
import { summarizeThread } from "./thread-summarizer";

export const generateResponse = async (
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
  context?: { channel?: string; threadTs?: string; botUserId?: string }
) => {
  const { text } = await generateText({
    model: openai("gpt-4o"),
    system: `You are a Slack bot assistant. Keep your responses concise and to the point.
    - Do not tag users.
    - Current date is: ${new Date().toISOString().split("T")[0]}
    - Make sure to ALWAYS include sources in your final response if you use web search. Put sources inline if possible.
    - When users want to copy threads, they'll provide two Slack links - help them use the copyThread tool.
    - When users ask to summarize a thread, use the summarizeThread tool if you have the thread context.`,
    messages,
    maxSteps: 10,
    tools: {
      getWeather: tool({
        description: "Get the current weather at a location",
        parameters: z.object({
          latitude: z.number(),
          longitude: z.number(),
          city: z.string(),
        }),
        execute: async ({ latitude, longitude, city }) => {
          updateStatus?.(`is getting weather for ${city}...`);

          const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode,relativehumidity_2m&timezone=auto`
          );

          const weatherData = await response.json();
          return {
            temperature: weatherData.current.temperature_2m,
            weatherCode: weatherData.current.weathercode,
            humidity: weatherData.current.relativehumidity_2m,
            city,
          };
        },
      }),
      searchWeb: tool({
        description: "Use this to search the web for information",
        parameters: z.object({
          query: z.string(),
          specificDomain: z
            .string()
            .nullable()
            .describe(
              "a domain to search if the user specifies e.g. bbc.com. Should be only the domain name without the protocol"
            ),
        }),
        execute: async ({ query, specificDomain }) => {
          updateStatus?.(`is searching the web for ${query}...`);
          const { results } = await exa.searchAndContents(query, {
            livecrawl: "always",
            numResults: 3,
            includeDomains: specificDomain ? [specificDomain] : undefined,
          });

          return {
            results: results.map((result) => ({
              title: result.title,
              url: result.url,
              snippet: result.text.slice(0, 1000),
            })),
          };
        },
      }),
      copyThread: tool({
        description:
          "Copy a Slack thread from one location to another without notifying original participants",
        parameters: z.object({
          sourceThreadLink: z
            .string()
            .describe("The Slack link to the source thread to copy"),
          destinationChannelLink: z
            .string()
            .describe(
              "The Slack link to the destination channel where the thread should be copied"
            ),
        }),
        execute: async ({ sourceThreadLink, destinationChannelLink }) => {
          updateStatus?.(`📋 Copying thread...`);

          const result = await copyThread(
            sourceThreadLink,
            destinationChannelLink
          );

          if (result.success) {
            updateStatus?.(`✅ Thread copied successfully!`);
          } else {
            updateStatus?.(`❌ Failed to copy thread`);
          }

          return result;
        },
      }),
      summarizeThread: tool({
        description:
          "Summarize the current Slack thread conversation, identifying key topics, decisions, and action items",
        parameters: z.object({
          focusArea: z
            .string()
            .optional()
            .describe(
              "Specific aspect to focus on when summarizing (e.g., 'decisions made', 'action items', 'technical details')"
            ),
        }),
        execute: async ({ focusArea }) => {
          // Check if we have thread context
          if (!context?.channel || !context?.threadTs || !context?.botUserId) {
            return {
              success: false,
              summary:
                "Thread context not available. This tool works when called within a thread conversation.",
              error: "Missing thread context",
            };
          }

          updateStatus?.(`📊 Analyzing thread...`);

          // Fetch thread messages
          const {
            messages: threadMessages,
            hasFullAccess,
            error,
          } = await getThreadWithPermissionCheck(
            context.channel,
            context.threadTs,
            context.botUserId
          );

          if (error && threadMessages.length === 0) {
            return {
              success: false,
              summary: "",
              error: `Unable to access thread: ${error}. For channel threads, ensure the bot has 'channels:history' and 'groups:history' permissions.`,
            };
          }

          if (!hasFullAccess) {
            updateStatus?.(
              `⚠️ Limited thread access - summarizing ${threadMessages.length} visible messages...`
            );
          }

          // Generate summary
          const summary = await summarizeThread(
            threadMessages,
            focusArea || "Please provide a comprehensive summary"
          );

          return {
            success: true,
            summary: summary,
            messageCount: threadMessages.length,
            hasFullAccess: hasFullAccess,
          };
        },
      }),
    },
  });

  // Convert markdown to Slack mrkdwn format
  return text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");
};
