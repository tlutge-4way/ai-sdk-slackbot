export const AGENT_CONFIG = {
  models: {
    chat: process.env.CHAT_AGENT_MODEL || "gpt-4o-mini",
    supervisor: process.env.SUPERVISOR_MODEL || "gpt-4o",
    perplexity: process.env.PERPLEXITY_MODEL || "sonar-pro",
  },
  timeouts: {
    default: parseInt(process.env.AGENT_TIMEOUT_MS || "30000"),
    chat: 10000,
    supervisor: 30000,
    tool: 20000,
  },
  features: {
    logging: process.env.ENABLE_AGENT_LOGGING === "true",
    retries: parseInt(process.env.MAX_AGENT_RETRIES || "2"),
  },
};
