// src/types/evolution.ts
// Interfaces e tipos para Evolution API v2

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
  integration: string;
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

// Formato conforme documentação Evolution API v2
export interface EvolutionWebhookPayload {
  webhook: {
    enabled: boolean;
    url: string;
    webhookByEvents: boolean;
    webhookBase64: boolean;
    events: string[];
  };
}

// Resposta da API quando obtém webhook
export interface EvolutionWebhookResponse {
  webhook?: {
    enabled: boolean;
    url: string;
    webhookByEvents: boolean;
    webhookBase64: boolean;
    events: string[];
  };
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
}

export interface EvolutionSessionInfo {
  instanceName: string;
  status: string;
  [key: string]: any;
}

export interface SendTextMessagePayload {
  number: string;
  text: string;
}
