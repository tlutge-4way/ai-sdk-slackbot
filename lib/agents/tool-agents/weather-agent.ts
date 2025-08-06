import { openai } from "@ai-sdk/openai";
import { CoreMessage, generateText, tool } from "ai";
import { z } from "zod";
import { ToolAgent, AgentContext, AgentResponse } from "../types";

export class WeatherAgent implements ToolAgent {
  name = "WeatherAgent";
  description = "Weather information and forecasts";
  tools = ["get_weather"];

  async canHandle(query: string, context: AgentContext): Promise<boolean> {
    const patterns = [
      /weather/i,
      /temperature/i,
      /forecast/i,
      /rain/i,
      /snow/i,
    ];
    return patterns.some((p) => p.test(query));
  }

  async execute(
    messages: CoreMessage[],
    context: AgentContext
  ): Promise<AgentResponse> {
    try {
      context.updateStatus?.("🌤️ Checking weather...");

      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        system: `You are a weather assistant. Extract location and provide weather information.`,
        messages,
        tools: {
          getWeather: tool({
            description: "Get weather for a location",
            parameters: z.object({
              latitude: z.number(),
              longitude: z.number(),
              city: z.string(),
            }),
            execute: async ({ latitude, longitude, city }) => {
              const response = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode,relativehumidity_2m&timezone=auto`
              );
              const data = await response.json();
              return {
                temperature: data.current.temperature_2m,
                weatherCode: data.current.weathercode,
                humidity: data.current.relativehumidity_2m,
                city,
              };
            },
          }),
        },
      });

      return {
        success: true,
        message: this.formatForSlack(text),
        data: { source: "weather_api" },
      };
    } catch (error) {
      console.error("WeatherAgent error:", error);
      return {
        success: false,
        message: "Failed to get weather information.",
      };
    }
  }

  private formatForSlack(text: string): string {
    return text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");
  }
}
