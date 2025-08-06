interface AgentMetrics {
  agentName: string;
  executionTime: number;
  success: boolean;
  timestamp: Date;
  context?: any;
}

export class AgentAnalytics {
  private metrics: AgentMetrics[] = [];

  recordExecution(
    agentName: string,
    startTime: number,
    success: boolean,
    context?: any
  ) {
    this.metrics.push({
      agentName,
      executionTime: Date.now() - startTime,
      success,
      timestamp: new Date(),
      context,
    });

    // Log if enabled
    if (process.env.ENABLE_AGENT_LOGGING === "true") {
      console.log(
        `[Agent: ${agentName}] Execution time: ${
          Date.now() - startTime
        }ms, Success: ${success}`
      );
    }
  }

  getMetrics(agentName?: string): AgentMetrics[] {
    if (agentName) {
      return this.metrics.filter((m) => m.agentName === agentName);
    }
    return this.metrics;
  }

  getAverageExecutionTime(agentName: string): number {
    const agentMetrics = this.getMetrics(agentName);
    if (agentMetrics.length === 0) return 0;

    const total = agentMetrics.reduce((sum, m) => sum + m.executionTime, 0);
    return total / agentMetrics.length;
  }

  getSuccessRate(agentName: string): number {
    const agentMetrics = this.getMetrics(agentName);
    if (agentMetrics.length === 0) return 0;

    const successful = agentMetrics.filter((m) => m.success).length;
    return (successful / agentMetrics.length) * 100;
  }
}
