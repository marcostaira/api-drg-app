// src/types/evolution.types.ts
// Tipos para integração com Evolution API v2

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
