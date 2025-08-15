// src/types/evolution.types.ts
// Tipos para integração com Evolution API v2 - CORRIGIDO com fetchInstances

export interface EvolutionInstance {
  instance: {
    instanceName: string;
    status: "open" | "close" | "connecting";
  };
  qrcode?: {
    code: string;
    base64: string;
  };
}

// NOVO: Tipo para dados completos da instância via fetchInstances
export interface EvolutionInstanceData {
  id: string;
  name: string;
  connectionStatus: "open" | "close" | "connecting";
  ownerJid: string;
  profileName: string | null;
  profilePicUrl: string | null;
  integration: string;
  number: string | null;
  businessId: string | null;
  token: string; // IMPORTANTE: Token da sessão
  clientName: string;
  disconnectionReasonCode: number | null;
  disconnectionObject: any | null;
  disconnectionAt: string | null;
  createdAt: string;
  updatedAt: string;
  Chatwoot: any | null;
  Proxy: any | null;
  Rabbitmq: any | null;
  Sqs: any | null;
  Websocket: any | null;
  Setting: {
    id: string;
    rejectCall: boolean;
    msgCall: string;
    groupsIgnore: boolean;
    alwaysOnline: boolean;
    readMessages: boolean;
    readStatus: boolean;
    syncFullHistory: boolean;
    wavoipToken: string;
    createdAt: string;
    updatedAt: string;
    instanceId: string;
  };
  _count: {
    Message: number;
    Contact: number;
    Chat: number;
  };
}

export interface EvolutionCreateInstancePayload {
  instanceName: string;
  integration: "WHATSAPP-BAILEYS" | "WHATSAPP-BUSINESS";
  token?: string;
  qrcode?: boolean;
  number?: string;
  webhook?: string;
  webhookByEvents?: boolean;
  events?: string[];
}

export interface EvolutionWebhookConfig {
  url: string;
  enabled: boolean;
  webhookByEvents?: boolean;
  webhookBase64?: boolean;
  events?: string[];
}

export interface EvolutionSettings {
  rejectCall: boolean;
  msgCall: string;
  groupsIgnore: boolean;
  alwaysOnline: boolean;
  readMessages: boolean;
  readStatus: boolean;
  syncFullHistory: boolean;
}

export interface EvolutionSessionStatus {
  state: string;
  statusReason?: number;
}

export interface EvolutionSessionInfo {
  instance?: {
    instanceName: string;
    status: string;
  };
  hash?: {
    apikey: string;
  };
  settings?: EvolutionSettings;
  webhook?: EvolutionWebhookConfig;
}

export interface SendTextMessageOptions {
  delay?: number;
  linkPreview?: boolean;
  mentionsEveryOne?: boolean;
  mentioned?: string[];
  quoted?: {
    key: {
      id: string;
    };
    message: {
      conversation: string;
    };
  };
}

export interface SendTextMessagePayload {
  number: string;
  text: string;
  delay?: number;
  linkPreview?: boolean;
  mentionsEveryOne?: boolean;
  mentioned?: string[];
  quoted?: SendTextMessageOptions["quoted"];
}

export interface EvolutionWebhookMessage {
  key?: {
    id: string;
    fromMe: boolean;
    remoteJid: string;
  };
  message?: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
  };
  messageType?: string;
  pushName?: string;
  messageTimestamp?: number;
}

export interface EvolutionConnectionUpdate {
  state: "open" | "connecting" | "close";
  statusReason?: number;
  user?: {
    id: string;
    name: string;
  };
}

export interface EvolutionQRCodeUpdate {
  qrCode: string;
  qrcode?: {
    base64: string;
    code: string;
  };
}
