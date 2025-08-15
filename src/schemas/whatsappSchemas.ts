// src/schemas/whatsappSchemas.ts
// Schemas de validação para WhatsApp - API Key opcional

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

// Schema para webhook data
export const webhookDataSchema = z.object({
  event: z.string(),
  data: z.any().optional(),
});

// Tipos TypeScript exportados
export type ConnectRequest = z.infer<typeof connectSchema>;
export type DisconnectRequest = z.infer<typeof disconnectSchema>;
export type SendMessageRequest = z.infer<typeof sendMessageSchema>;
export type StatusRequest = z.infer<typeof statusSchema>;
export type WebhookData = z.infer<typeof webhookDataSchema>;
