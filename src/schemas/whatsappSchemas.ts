// src/schemas/whatsappSchemas.ts
// Schemas de validação para WhatsApp com API Key

import { z } from "zod";

// Schema para conectar tenant
export const connectSchema = z.object({
  tenantId: z.coerce
    .number()
    .int()
    .positive("ID do tenant deve ser um número positivo"),
  evolutionApiKey: z
    .string()
    .min(1, "API Key é obrigatória")
    .max(500, "API Key muito longa"),
});

// Schema para desconectar
export const disconnectSchema = z.object({
  tenantId: z.coerce
    .number()
    .int()
    .positive("ID do tenant deve ser um número positivo"),
});

// Schema para enviar mensagem
export const sendMessageSchema = z.object({
  tenantId: z.coerce
    .number()
    .int()
    .positive("ID do tenant deve ser um número positivo"),
  phoneNumber: z
    .string()
    .min(10, "Número de telefone inválido")
    .max(20, "Número de telefone muito longo"),
  text: z
    .string()
    .min(1, "Texto da mensagem é obrigatório")
    .max(4096, "Texto muito longo"),
  options: z
    .object({
      delay: z.number().min(0).max(60000).optional(),
      linkPreview: z.boolean().optional(),
      mentionsEveryOne: z.boolean().optional(),
      mentioned: z.array(z.string()).optional(),
      quoted: z
        .object({
          key: z.object({
            id: z.string(),
          }),
          message: z.object({
            conversation: z.string(),
          }),
        })
        .optional(),
    })
    .optional(),
});

// Schema para status
export const statusSchema = z.object({
  tenantId: z.coerce
    .number()
    .int()
    .positive("ID do tenant deve ser um número positivo"),
});

// Schema para webhook data
export const webhookDataSchema = z.object({
  event: z.string(),
  data: z.any().optional(),
});

// Schema para atualizar API Key
export const updateApiKeySchema = z.object({
  tenantId: z.coerce
    .number()
    .int()
    .positive("ID do tenant deve ser um número positivo"),
  evolutionApiKey: z
    .string()
    .min(1, "API Key é obrigatória")
    .max(500, "API Key muito longa"),
});

// Tipos TypeScript exportados
export type ConnectRequest = z.infer<typeof connectSchema>;
export type DisconnectRequest = z.infer<typeof disconnectSchema>;
export type SendMessageRequest = z.infer<typeof sendMessageSchema>;
export type StatusRequest = z.infer<typeof statusSchema>;
export type WebhookData = z.infer<typeof webhookDataSchema>;
export type UpdateApiKeyRequest = z.infer<typeof updateApiKeySchema>;
