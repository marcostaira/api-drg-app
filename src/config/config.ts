import { z } from "zod";

const configSchema = z.object({
  port: z.coerce.number().default(3000),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  databaseUrl: z.string().url(),
  allowedOrigins: z.string().transform((str) => str.split(",")),
  rateLimitWindowMs: z.coerce.number().default(15 * 60 * 1000), // 15 minutes
  rateLimitMaxRequests: z.coerce.number().default(100),
  evolutionApiUrl: z.string().url(),
  evolutionApiKey: z.string(),
  webhookBaseUrl: z.string().url(),
});

const env = {
  port: process.env.PORT,
  nodeEnv: process.env.NODE_ENV,
  databaseUrl: process.env.DATABASE_URL,
  allowedOrigins: process.env.ALLOWED_ORIGINS || "http://localhost:3000",
  rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS,
  rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS,
  evolutionApiUrl: process.env.EVOLUTION_API_URL,
  evolutionApiKey: process.env.EVOLUTION_API_KEY,
  webhookBaseUrl: process.env.WEBHOOK_BASE_URL,
};

export const config = configSchema.parse(env);
