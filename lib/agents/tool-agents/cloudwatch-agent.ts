import { openai } from "@ai-sdk/openai";
import { CoreMessage, generateText } from "ai";
import { ToolAgent, AgentContext, AgentResponse } from "../types";
// import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";

export class CloudWatchAgent implements ToolAgent {
  name = "CloudWatchAgent";
  description = "AWS CloudWatch metrics and monitoring";
  tools = ["get_metrics", "get_alarms", "get_logs"];

  async canHandle(query: string, context: AgentContext): Promise<boolean> {
    const patterns = [
      /cloudwatch|metrics|monitoring/i,
      /aws.*logs?|errors?|warnings?/i,
      /performance|latency|cpu|memory/i,
      /alarms?|alerts?/i,
    ];
    return patterns.some((p) => p.test(query));
  }

  async execute(
    messages: CoreMessage[],
    context: AgentContext
  ): Promise<AgentResponse> {
    try {
      context.updateStatus?.("📈 Fetching metrics...");

      // Mock CloudWatch data
      const metrics = await this.fetchMetrics();
      const formattedMetrics = this.formatMetrics(metrics);

      return {
        success: true,
        message: formattedMetrics,
        data: { source: "cloudwatch", metrics },
      };
    } catch (error) {
      console.error("CloudWatchAgent error:", error);
      return {
        success: false,
        message: "Failed to fetch CloudWatch metrics.",
      };
    }
  }

  private async fetchMetrics(): Promise<any> {
    // Implement CloudWatch API calls
    return {
      cpu: { average: 45, max: 78 },
      memory: { average: 62, max: 85 },
      errors: 12,
      latency: { p50: 120, p99: 450 },
    };
  }

  private formatMetrics(metrics: any): string {
    return `📊 *CloudWatch Metrics*
    
*CPU Usage*: ${metrics.cpu.average}% avg, ${metrics.cpu.max}% max
*Memory*: ${metrics.memory.average}% avg, ${metrics.memory.max}% max
*Errors (24h)*: ${metrics.errors}
*Latency*: ${metrics.latency.p50}ms (p50), ${metrics.latency.p99}ms (p99)`;
  }
}
