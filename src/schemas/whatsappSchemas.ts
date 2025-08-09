// src/schemas/whatsappSchemas.ts
// Schemas de validação com Zod para WhatsApp API

import { z } from "zod";

// Schema para conectar tenant
export const connectSchema = z.object({
  tenantId: z.coerce
    .number()
    .int()
    .positive("ID do tenant deve ser um número positivo"),
});

// Schema para desconectar sessão
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
    .min(10, "Número de telefone deve ter pelo menos 10 dígitos")
    .max(15, "Número de telefone deve ter no máximo 15 dígitos")
    .regex(/^\d+$/, "Número de telefone deve conter apenas dígitos"),
  text: z
    .string()
    .min(1, "Texto da mensagem é obrigatório")
    .max(4096, "Mensagem muito longa (máximo 4096 caracteres)"),
});

// Schema para obter status
export const statusSchema = z.object({
  tenantId: z.coerce
    .number()
    .int()
    .positive("ID do tenant deve ser um número positivo"),
});

// Schema para webhook
export const webhookSchema = z.object({
  tenantId: z.coerce
    .number()
    .int()
    .positive("ID do tenant deve ser um número positivo"),
});

// Schema para dados do webhook
export const webhookDataSchema = z.object({
  event: z.string().min(1, "Evento é obrigatório"),
  data: z.any().optional().default({}), // Tornar opcional com valor padrão
});

// Tipos inferidos dos schemas
export type ConnectRequest = z.infer<typeof connectSchema>;
export type DisconnectRequest = z.infer<typeof disconnectSchema>;
export type SendMessageRequest = z.infer<typeof sendMessageSchema>;
export type StatusRequest = z.infer<typeof statusSchema>;
export type WebhookRequest = z.infer<typeof webhookSchema>;
export type WebhookDataRequest = z.infer<typeof webhookDataSchema>;
