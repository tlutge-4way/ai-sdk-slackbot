import { openai } from "@ai-sdk/openai";
import { CoreMessage, generateText } from "ai";
import { ToolAgent, AgentContext, AgentResponse } from "../types";
// Import your database client (e.g., Prisma, Supabase, etc.)
// import { prisma } from "../../db";

export class DatabaseAgent implements ToolAgent {
  name = "DatabaseAgent";
  description = "Database queries and data retrieval";
  tools = ["query_database", "update_database"];

  async canHandle(query: string, context: AgentContext): Promise<boolean> {
    const patterns = [
      /database|db/i,
      /get.*data|fetch.*records/i,
      /users?|orders?|products?/i, // Your domain entities
      /analytics|metrics|statistics/i,
    ];
    return patterns.some((p) => p.test(query));
  }

  async execute(
    messages: CoreMessage[],
    context: AgentContext
  ): Promise<AgentResponse> {
    try {
      context.updateStatus?.("🗄️ Querying database...");

      // Extract query intent
      const queryIntent = await this.extractQueryIntent(messages);

      // Execute database operation
      const result = await this.executeQuery(queryIntent);

      // Format response
      const formattedResponse = await this.formatQueryResult(
        result,
        queryIntent
      );

      return {
        success: true,
        message: formattedResponse,
        data: {
          operation: "database_query",
          recordCount: result.length,
          query: queryIntent,
        },
      };
    } catch (error) {
      console.error("DatabaseAgent error:", error);
      return {
        success: false,
        message: "Failed to query database.",
      };
    }
  }

  private async extractQueryIntent(messages: CoreMessage[]): Promise<any> {
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system: `Extract database query intent. Return JSON with:
      - entity: what to query (users, orders, etc.)
      - operation: read/write/update/delete
      - filters: any conditions
      - fields: specific fields needed`,
      messages,
    });

    return JSON.parse(text);
  }

  private async executeQuery(intent: any): Promise<any[]> {
    // Implement your database query logic
    // Example with Prisma:
    /*
    switch (intent.entity) {
      case "users":
        return await prisma.user.findMany({
          where: intent.filters,
          select: intent.fields,
        });
      case "orders":
        return await prisma.order.findMany({
          where: intent.filters,
          include: { user: true },
        });
      default:
        throw new Error(`Unknown entity: ${intent.entity}`);
    }
    */

    // Mock response for demonstration
    return [
      { id: 1, name: "Sample Record", value: 100 },
      { id: 2, name: "Another Record", value: 200 },
    ];
  }

  private async formatQueryResult(result: any[], intent: any): Promise<string> {
    if (result.length === 0) {
      return "No records found matching your criteria.";
    }

    // Format as Slack table or list
    let response = `📊 *Database Query Results*\n`;
    response += `Found ${result.length} ${intent.entity}\n\n`;

    // Simple table format
    result.slice(0, 10).forEach((record) => {
      response += `• ${JSON.stringify(record)}\n`;
    });

    if (result.length > 10) {
      response += `\n_...and ${result.length - 10} more records_`;
    }

    return response;
  }
}
