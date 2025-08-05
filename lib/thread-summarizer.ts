import { openai } from "@ai-sdk/openai";
import { CoreMessage, generateText } from "ai";
import { client } from "./slack-utils";

export async function summarizeThread(
  messages: CoreMessage[],
  requestText: string
): Promise<string> {
  // If we don't have enough messages, return a helpful message
  if (messages.length < 2) {
    return "I need access to more messages in this thread to provide a summary. This might be due to permission limitations. Try in a direct message thread where I have full access.";
  }

  try {
    const { text } = await generateText({
      model: openai("gpt-4o"),
      system: `You are a helpful Slack assistant that creates concise, clear thread summaries.
      When summarizing threads:
      - Identify key topics and decisions made
      - Highlight action items or questions that need answers
      - Note any important links or resources shared
      - Keep the summary concise but comprehensive
      - Use bullet points for clarity
      - Identify who said what when relevant
      Current date: ${new Date().toISOString().split("T")[0]}`,
      messages: [
        ...messages.slice(0, -1), // Include all thread context except the summary request
        {
          role: "user",
          content: `Please summarize this thread conversation. Focus on: ${requestText}`,
        },
      ],
    });

    // Format for Slack
    return `📋 *Thread Summary*\n\n${text.replace(/\*\*/g, "*")}`;
  } catch (error) {
    console.error("Error generating summary:", error);
    return "I encountered an error while generating the summary. Please try again.";
  }
}
