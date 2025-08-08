import axios, { AxiosResponse } from "axios";
import { config } from "../config/config";

// Tipos para Evolution API v2
interface EvolutionInstance {
  instance: {
    instanceName: string;
    status: "open" | "close" | "connecting";
  };
  qrcode?: {
    code: string;
    base64: string;
  };
}

interface EvolutionCreateInstancePayload {
  instanceName: string;
  integration: string;
  token?: string;
  qrcode?: boolean;
  number?: string;
  webhook?: string;
  webhookByEvents?: boolean;
  events?: string[];
}

interface EvolutionWebhookConfig {
  url: string;
  enabled: boolean;
  webhookByEvents?: boolean;
  webhookBase64?: boolean;
  events?: string[];
}

interface EvolutionSettings {
  rejectCall: boolean;
  msgCall: string;
  groupsIgnore: boolean;
  alwaysOnline: boolean;
  readMessages: boolean;
  readStatus: boolean;
  syncFullHistory: boolean;
}

class EvolutionService {
  private baseURL: string;
  private apiKey: string;
  private axiosInstance;

  constructor() {
    this.baseURL = config.evolutionApiUrl;
    this.apiKey = config.evolutionApiKey;

    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      headers: {
        apikey: this.apiKey,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  // Verificar se a instância existe
  async checkSession(instanceName: string): Promise<boolean> {
    try {
      console.log("🔍 Verificando se instância existe:", instanceName);
      const response = await this.axiosInstance.get(
        `/instance/${instanceName}`
      );
      console.log("✅ Instância encontrada:", response.status);
      return response.status === 200;
    } catch (error: any) {
      console.log("❌ Erro ao verificar instância:", {
        status: error.response?.status,
        instanceName,
      });

      if (error.response?.status === 404) {
        console.log("❌ Instância não existe (404)");
        return false; // Instância não existe
      }

      // Se for erro 403 (Forbidden), a instância existe mas não temos acesso
      if (error.response?.status === 403) {
        console.log("⚠️ Instância existe mas sem acesso (403)");
        return true; // Instância existe
      }

      console.error(
        "Erro inesperado ao verificar instância:",
        error.response?.status
      );
      return false;
    }
  }

  // Criar nova instância
  async createSession(instanceName: string, webhookUrl?: string): Promise<any> {
    try {
      // Payload com integration obrigatório
      const payload: EvolutionCreateInstancePayload = {
        instanceName,
        integration: "WHATSAPP-BAILEYS", // ou "WHATSAPP-BUSINESS"
        qrcode: true,
      };

      console.log("🚀 Criando instância com integration:", payload);
      const response = await this.axiosInstance.post(
        "/instance/create",
        payload
      );
      console.log("✅ Instância criada:", response.data);
      return response.data;
    } catch (error: any) {
      // Se erro 403, instância já existe - não é erro crítico
      if (error.response?.status === 403) {
        console.log("⚠️ Instância já existe (403), continuando fluxo...");
        return {
          instance: { instanceName, status: "existing" },
          message: "Instance already exists",
        };
      }

      console.log("❌ Erro ao criar instância:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.response?.data?.response?.message,
        headers: error.response?.headers,
        payload: JSON.parse(error.config?.data || "{}"),
      });
      throw error;
    }
  }

  // Configurar instância (rejeitar grupos, não sincronizar histórico, etc.)
  async configureSession(instanceName: string): Promise<void> {
    const settings: EvolutionSettings = {
      rejectCall: false,
      msgCall:
        "Não atendemos chamadas por aqui. Por favor, envie uma mensagem.",
      groupsIgnore: true, // Ignorar mensagens de grupos
      alwaysOnline: false,
      readMessages: false,
      readStatus: false,
      syncFullHistory: false, // Não sincronizar histórico
    };

    await this.axiosInstance.post(`/settings/set/${instanceName}`, settings);
  }

  // Configurar webhook
  async configureWebhook(
    instanceName: string,
    webhookUrl: string
  ): Promise<void> {
    try {
      const webhookConfig: EvolutionWebhookConfig = {
        url: webhookUrl,
        enabled: true,
        webhookByEvents: true,
        webhookBase64: true,
        events: ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT"],
      };

      await this.axiosInstance.post(
        `/webhook/set/${instanceName}`,
        webhookConfig
      );
    } catch (error) {
      console.log(error);
    }
  }

  // Obter status da instância
  async getSessionStatus(instanceName: string): Promise<any> {
    const response = await this.axiosInstance.get(
      `/instance/connectionState/${instanceName}`
    );
    return response.data;
  }

  // Obter informações da instância
  async getSessionInfo(instanceName: string): Promise<any> {
    try {
      const response = await this.axiosInstance.get(
        `/instance/${instanceName}`
      );
      return response.data;
    } catch (error) {
      console.error("Erro ao obter informações da instância:", error);
      return null;
    }
  }

  // Desconectar instância
  async disconnectSession(instanceName: string): Promise<void> {
    await this.axiosInstance.delete(`/instance/logout/${instanceName}`);
  }

  // Deletar instância
  async deleteSession(instanceName: string): Promise<void> {
    await this.axiosInstance.delete(`/instance/delete/${instanceName}`);
  }

  // Enviar mensagem de texto
  async sendTextMessage(
    instanceName: string,
    phoneNumber: string,
    text: string
  ): Promise<any> {
    const payload = {
      number: phoneNumber,
      text: text,
    };

    const response = await this.axiosInstance.post(
      `/message/sendText/${instanceName}`,
      payload
    );
    return response.data;
  }

  // Obter QR Code
  async getQRCode(instanceName: string): Promise<string | null> {
    try {
      const response = await this.axiosInstance.get(
        `/instance/connect/${instanceName}`
      );
      return response.data?.qrcode?.base64 || null;
    } catch (error) {
      console.error("Erro ao obter QR Code:", error);
      return null;
    }
  }
}

export const evolutionService = new EvolutionService();
