// src/types/whatsapp.types.ts
// Interfaces e tipos para WhatsApp API - CORRIGIDO sessionToken

export interface WhatsAppConnectionResult {
  sessionId: string;
  sessionName: string;
  status: string;
  qrCode?: string;
  webhookUrl: string;
  sessionToken?: string | null; // CORRIGIDO: aceitar null
  evolutionApiKey?: string;
  message?: string;
}

export interface WhatsAppSessionStatus {
  connected: boolean;
  status: string;
  phoneNumber?: string;
  profileName?: string;
  sessionName?: string;
  sessionToken?: string | null; // CORRIGIDO: aceitar null
  connectedAt?: Date;
  evolutionStatus?: string;
  connectionStatus?: string;
  ownerJid?: string;
  sessionInfo?: any;
  error?: string;
  message?: string;
}

// ... resto dos tipos permanece igual
export interface WebhookData {
  event: string;
  data?: any;
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
  // evolutionApiKey removido - agora usa do .env
}

export interface DisconnectRequest {
  tenantId: number;
}
