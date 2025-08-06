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
        system: `You are a weather assistant. Extract location and provide weather information.
         When users ask about weather, use the getWeather tool to fetch current conditions.
         Always provide temperature in both Celsius and Fahrenheit.`,
        messages,
        tools: {
          getWeather: tool({
            description: "Get weather for a location",
            parameters: z.object({
              latitude: z.number().describe("Latitude of the location"),
              longitude: z.number().describe("Longitude of the location"),
              city: z.string().describe("Name of the city"),
            }),
            execute: async ({ latitude, longitude, city }) => {
              try {
                const response = await fetch(
                  `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode,relativehumidity_2m,windspeed_10m&timezone=auto`
                );

                if (!response.ok) {
                  throw new Error(`Weather API error: ${response.status}`);
                }

                const data = await response.json();

                const weatherDescriptions: { [key: number]: string } = {
                  0: "Clear sky",
                  1: "Mainly clear",
                  2: "Partly cloudy",
                  3: "Overcast",
                  45: "Foggy",
                  48: "Depositing rime fog",
                  51: "Light drizzle",
                  53: "Moderate drizzle",
                  55: "Dense drizzle",
                  61: "Slight rain",
                  63: "Moderate rain",
                  65: "Heavy rain",
                  71: "Slight snow",
                  73: "Moderate snow",
                  75: "Heavy snow",
                  95: "Thunderstorm",
                };

                const weatherCode = data.current.weathercode;
                const description =
                  weatherDescriptions[weatherCode] || "Unknown conditions";

                return {
                  temperature_c: data.current.temperature_2m,
                  temperature_f: (data.current.temperature_2m * 9) / 5 + 32,
                  description: description,
                  humidity: data.current.relativehumidity_2m,
                  windSpeed: data.current.windspeed_10m,
                  city: city,
                };
              } catch (error) {
                console.error("Weather fetch error:", error);
                throw new Error(`Failed to fetch weather for ${city}`);
              }
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
        message: "Failed to get weather information. Please try again.",
      };
    }
  }

  private formatForSlack(text: string): string {
    return text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");
  }
}
