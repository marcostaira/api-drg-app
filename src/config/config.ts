// src/config/config.ts
// Configurações da aplicação com validação melhorada

import { z } from "zod";

// Schema de validação para as configurações
const configSchema = z.object({
  // Configurações do servidor
  port: z.coerce.number().min(1).max(65535).default(3000),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),

  // Configurações do banco de dados
  databaseUrl: z.string().url("URL do banco de dados deve ser válida"),

  // Configurações de segurança
  allowedOrigins: z
    .string()
    .transform((str) => str.split(",").map((origin) => origin.trim())),
  rateLimitWindowMs: z.coerce
    .number()
    .positive()
    .default(15 * 60 * 1000), // 15 minutos
  rateLimitMaxRequests: z.coerce.number().positive().default(100),

  // Configurações da Evolution API
  evolutionApiUrl: z.string().url("URL da Evolution API deve ser válida"),
  evolutionApiKey: z.string().min(1, "Chave da Evolution API é obrigatória"),

  // Configurações de webhook
  webhookBaseUrl: z.string().url("URL base do webhook deve ser válida"),
});

// Objeto de ambiente com validação
const env = {
  port: process.env.PORT,
  nodeEnv: process.env.NODE_ENV,
  databaseUrl: process.env.DATABASE_URL,
  allowedOrigins:
    process.env.ALLOWED_ORIGINS ||
    "http://localhost:3000,http://localhost:3001",
  rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS,
  rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS,
  evolutionApiUrl: process.env.EVOLUTION_API_URL,
  evolutionApiKey: process.env.EVOLUTION_API_KEY,
  webhookBaseUrl: process.env.WEBHOOK_BASE_URL,
};

// Validar e exportar configurações
export const config = configSchema.parse(env);

// Log das configurações (sem dados sensíveis)
if (config.nodeEnv === "development") {
  console.log("⚙️ Configurações carregadas:", {
    port: config.port,
    nodeEnv: config.nodeEnv,
    allowedOrigins: config.allowedOrigins,
    rateLimitWindowMs: config.rateLimitWindowMs,
    rateLimitMaxRequests: config.rateLimitMaxRequests,
    evolutionApiUrl: config.evolutionApiUrl,
    evolutionApiKey: config.evolutionApiKey
      ? "[CONFIGURADA]"
      : "[NÃO CONFIGURADA]",
    webhookBaseUrl: config.webhookBaseUrl,
    databaseUrl: config.databaseUrl ? "[CONFIGURADA]" : "[NÃO CONFIGURADA]",
  });
}
