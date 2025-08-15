// src/schemas/whatsappSchemas.ts
// Schemas de validação para WhatsApp - CORRIGIDO com exports corretos

import { z } from "zod";

// Schema para conectar tenant - SEM API Key (usa do .env)
export const connectSchema = z.object({
  tenantId: z.coerce
    .number()
    .int()
    .positive("ID do tenant deve ser um número positivo"),
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

// NOVO: Schema completo para webhook do Evolution API
export const evolutionWebhookSchema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.object({
    // Para mensagens
    key: z
      .object({
        remoteJid: z.string(),
        fromMe: z.boolean(),
        id: z.string(),
      })
      .optional(),
    pushName: z.string().optional(),
    status: z.string().optional(),
    message: z
      .object({
        conversation: z.string().optional(),
        extendedTextMessage: z
          .object({
            text: z.string(),
          })
          .optional(),
        messageContextInfo: z.any().optional(),
      })
      .optional(),
    messageType: z.string().optional(),
    messageTimestamp: z.number().optional(),
    instanceId: z.string().optional(),
    source: z.string().optional(),

    // Para QR Code
    qrcode: z
      .object({
        base64: z.string(),
        code: z.string(),
      })
      .optional(),

    // Para connection update
    state: z.enum(["open", "connecting", "close"]).optional(),
    statusReason: z.number().optional(),
    user: z
      .object({
        id: z.string(),
        name: z.string(),
      })
      .optional(),
  }),
  destination: z.string(),
  date_time: z.string(),
  sender: z.string(),
  server_url: z.string(),
  apikey: z.string(),
});

// Schema antigo para compatibilidade
export const webhookDataSchema = z.object({
  event: z.string(),
  data: z.any().optional(),
});

// TIPOS EXPORTADOS - IMPORTANTE!
export type ConnectRequest = z.infer<typeof connectSchema>;
export type DisconnectRequest = z.infer<typeof disconnectSchema>;
export type SendMessageRequest = z.infer<typeof sendMessageSchema>;
export type StatusRequest = z.infer<typeof statusSchema>;
export type EvolutionWebhookData = z.infer<typeof evolutionWebhookSchema>; // ← EXPORT CORRETO
export type WebhookData = z.infer<typeof webhookDataSchema>;
