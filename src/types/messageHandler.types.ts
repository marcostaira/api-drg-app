// src/types/messageHandler.types.ts
// Tipos para tratamento de mensagens recebidas

export interface IncomingMessageData {
  ownerId: number;
  senderNumber: string;
  messageText: string;
  messageId: string;
  timestamp: Date;
}

export interface MessageResponse {
  success: boolean;
  action?: "confirmed" | "rescheduled" | "fallback" | "ignored";
  statusUpdated?: boolean;
  templateSent?: boolean;
  message?: string;
}

export interface LastSentMessage {
  schedule_id: number;
  user_id: number;
  created_at: Date;
  template_type?: string;
}

export interface MessageValidation {
  isValidOption: boolean;
  isGarbage: boolean;
  isWithin24h: boolean;
  isAlreadyProcessed: boolean;
  shouldRespond: boolean;
  action?: "confirm" | "reschedule" | "fallback" | "ignore";
}
