// src/config/config.ts
// Configurações da aplicação com queue settings

import { z } from "zod";

const configSchema = z.object({
  // Server
  port: z.coerce.number().default(3000),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),

  // Database
  databaseUrl: z.string().url(),

  // CORS
  allowedOrigins: z.string().transform((str) => str.split(",")),

  // Rate Limiting
  rateLimitWindowMs: z.coerce.number().default(15 * 60 * 1000), // 15 minutes
  rateLimitMaxRequests: z.coerce.number().default(100),

  // Evolution API
  evolutionApiUrl: z.string().url(),
  evolutionApiKey: z.string(),

  // Webhook
  webhookBaseUrl: z.string().url(),

  // Queue Settings
  queueProcessInterval: z.coerce.number().default(5), // minutos
  queueBatchSize: z.coerce.number().default(10), // mensagens por vez
  queueDelayBetweenMessages: z.coerce.number().default(2000), // milissegundos
});

const env = {
  // Server
  port: process.env.PORT,
  nodeEnv: process.env.NODE_ENV,

  // Database
  databaseUrl: process.env.DATABASE_URL,

  // CORS
  allowedOrigins: process.env.ALLOWED_ORIGINS || "http://localhost:3000",

  // Rate Limiting
  rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS,
  rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS,

  // Evolution API
  evolutionApiUrl: process.env.EVOLUTION_API_URL,
  evolutionApiKey: process.env.EVOLUTION_API_KEY,

  // Webhook
  webhookBaseUrl: process.env.WEBHOOK_BASE_URL,

  // Queue Settings
  queueProcessInterval: process.env.QUEUE_PROCESS_INTERVAL,
  queueBatchSize: process.env.QUEUE_BATCH_SIZE,
  queueDelayBetweenMessages: process.env.QUEUE_DELAY_BETWEEN_MESSAGES,
};

export const config = configSchema.parse(env);
