import { CoreMessage } from "ai";
import { AgentOrchestrator } from "../lib/agents/orchestrator";

async function testAgentSystem() {
  const orchestrator = new AgentOrchestrator();

  const testCases = [
    {
      name: "Basic Chat",
      messages: [
        { role: "user", content: "Hello, how are you?" },
      ] as CoreMessage[],
      expectedAgent: "ChatAgent",
    },
    {
      name: "Weather Query",
      messages: [
        { role: "user", content: "What's the weather in London?" },
      ] as CoreMessage[],
      expectedAgent: "WeatherAgent",
    },
    {
      name: "Web Search",
      messages: [
        { role: "user", content: "Search for the latest AI news" },
      ] as CoreMessage[],
      expectedAgent: "PerplexityAgent",
    },
    {
      name: "Thread Summary",
      messages: [
        { role: "user", content: "Summarize this thread" },
      ] as CoreMessage[],
      expectedAgent: "ThreadAgent",
    },
  ];

  for (const testCase of testCases) {
    console.log(`\nTesting: ${testCase.name}`);
    console.log("Input:", testCase.messages[0].content);

    const result = await orchestrator.processMessage(testCase.messages, {
      updateStatus: (status) => console.log(`  Status: ${status}`),
    });

    console.log("Response:", result.substring(0, 100) + "...");
  }
}
