// src/types/whatsapp.ts
// Interfaces e tipos para WhatsApp API

export interface WhatsAppConnectionResult {
  sessionId: string;
  sessionName: string;
  status: string;
  qrCode?: string;
  webhookUrl: string;
  message?: string;
}

export interface WhatsAppSessionStatus {
  connected: boolean;
  status: string;
  phoneNumber?: string;
  profileName?: string;
  sessionName?: string;
  connectedAt?: Date;
  evolutionStatus?: string;
  sessionInfo?: any;
  error?: string;
  message?: string;
}

export interface WebhookData {
  event: string;
  data?: any; // Tornar opcional para compatibilidade
}

export interface QRCodeData {
  qrCode?: string;
}

export interface ConnectionUpdateData {
  state: "open" | "connecting" | "close";
  user?: {
    id: string;
    name: string;
  };
}

export interface MessageData {
  messages?: any[];
  messageType?: string;
  key?: {
    fromMe: boolean;
    remoteJid: string;
    id: string;
  };
  pushName?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
  };
  messageTimestamp?: number;
}

export interface SendMessageRequest {
  tenantId: number;
  phoneNumber: string;
  text: string;
}

export interface ConnectRequest {
  tenantId: number;
}

export interface DisconnectRequest {
  tenantId: number;
}
