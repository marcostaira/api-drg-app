// src/services/evolutionService.ts
// Serviço para integração com Evolution API v2 com verificações melhoradas

import axios, { AxiosResponse } from "axios";
import { config } from "../config/config";
import type {
  EvolutionInstance,
  EvolutionCreateInstancePayload,
  EvolutionWebhookConfig,
  EvolutionSettings,
  EvolutionSessionStatus,
  EvolutionSessionInfo,
  SendTextMessagePayload,
} from "../types/evolution.types";

export class EvolutionService {
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

  /**
   * Verifica se a instância existe no Evolution API
   * @param instanceName Nome da instância
   * @returns true se existe, false se não existe
   */
  async checkSession(instanceName: string): Promise<boolean> {
    try {
      console.log(
        "🔍 Verificando se instância existe no Evolution:",
        instanceName
      );

      const response = await this.axiosInstance.get(
        `/instance/${instanceName}`
      );

      console.log("✅ Instância encontrada no Evolution:", {
        status: response.status,
        instanceName,
        data: response.data?.instance?.instanceName,
      });

      return response.status === 200;
    } catch (error: any) {
      console.log("❌ Erro ao verificar instância no Evolution:", {
        status: error.response?.status,
        instanceName,
        message: error.response?.data?.message || error.message,
      });

      // Instância não existe (404)
      if (error.response?.status === 404) {
        console.log("❌ Instância não existe no Evolution (404)");
        return false;
      }

      // Instância existe mas sem acesso (403)
      if (error.response?.status === 403) {
        console.log("⚠️ Instância existe no Evolution mas sem acesso (403)");
        return true;
      }

      // Outros erros consideramos como não existente
      console.error(
        "Erro inesperado ao verificar instância:",
        error.response?.status
      );
      return false;
    }
  }

  /**
   * Obter informações detalhadas da instância
   * @param instanceName Nome da instância
   * @returns Informações da instância ou null
   */
  async getSessionInfo(
    instanceName: string
  ): Promise<EvolutionSessionInfo | null> {
    try {
      console.log("📋 Obtendo informações da instância:", instanceName);

      const response = await this.axiosInstance.get(
        `/instance/${instanceName}`
      );

      console.log("✅ Informações obtidas:", {
        instanceName,
        status: response.data?.instance?.status,
      });

      return response.data;
    } catch (error: any) {
      console.error("❌ Erro ao obter informações da instância:", {
        instanceName,
        status: error.response?.status,
        message: error.response?.data?.message || error.message,
      });
      return null;
    }
  }

  /**
   * Criar nova instância no Evolution API
   * @param instanceName Nome da instância
   * @param webhookUrl URL do webhook (opcional)
   * @returns Dados da instância criada
   */
  async createSession(instanceName: string, webhookUrl?: string): Promise<any> {
    try {
      const payload: EvolutionCreateInstancePayload = {
        instanceName,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
      };

      console.log("🚀 Criando nova instância no Evolution:", {
        instanceName,
        integration: payload.integration,
      });

      const response = await this.axiosInstance.post(
        "/instance/create",
        payload
      );

      console.log("✅ Instância criada no Evolution:", {
        instanceName,
        status: response.status,
      });

      return response.data;
    } catch (error: any) {
      // Se erro 403, instância já existe - não é erro crítico
      if (error.response?.status === 403) {
        console.log(
          "⚠️ Instância já existe no Evolution (403), continuando fluxo..."
        );
        return {
          instance: { instanceName, status: "existing" },
          message: "Instance already exists",
        };
      }

      console.error("❌ Erro ao criar instância no Evolution:", {
        instanceName,
        status: error.response?.status,
        statusText: error.response?.statusText,
        message:
          error.response?.data?.response?.message ||
          error.response?.data?.message,
        data: error.response?.data,
      });

      throw error;
    }
  }

  /**
   * Configurar instância (rejeitar grupos, não sincronizar histórico, etc.)
   * @param instanceName Nome da instância
   */
  async configureSession(instanceName: string): Promise<void> {
    try {
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

      console.log("⚙️ Configurando instância:", instanceName);

      await this.axiosInstance.post(`/settings/set/${instanceName}`, settings);

      console.log("✅ Instância configurada:", instanceName);
    } catch (error: any) {
      console.error("❌ Erro ao configurar instância:", {
        instanceName,
        status: error.response?.status,
        message: error.response?.data?.message || error.message,
      });
      throw error;
    }
  }

  /**
   * Configurar webhook da instância
   * @param instanceName Nome da instância
   * @param webhookUrl URL do webhook
   */
  async configureWebhook(
    instanceName: string,
    webhookUrl: string
  ): Promise<void> {
    try {
      // Validar URL do webhook
      if (!this.isValidWebhookUrl(webhookUrl)) {
        console.log("⚠️ URL do webhook pode ser inválida:", webhookUrl);
      }

      // 1. Primeiro verificar se webhook já está configurado
      console.log("🔍 Verificando webhook existente:", instanceName);
      const existingWebhook = await this.getWebhookConfig(instanceName);

      if (
        existingWebhook &&
        existingWebhook.webhook &&
        existingWebhook.webhook.url
      ) {
        console.log("ℹ️ Webhook já configurado:", {
          instanceName,
          currentUrl: existingWebhook.webhook.url,
          newUrl: webhookUrl,
        });

        // Se a URL é a mesma, não precisa reconfigurar
        if (
          existingWebhook.webhook.url === webhookUrl &&
          existingWebhook.webhook.enabled
        ) {
          console.log(
            "✅ Webhook já está configurado corretamente:",
            instanceName
          );
          return;
        }

        console.log("🔄 Atualizando webhook com nova URL...");
      }

      // 2. Configurar ou atualizar webhook com estrutura correta
      const webhookPayload = {
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: true,
          webhookBase64: true,
          events: ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT"],
        },
      };

      console.log("🎣 Configurando webhook:", {
        instanceName,
        webhookUrl,
        payload: webhookPayload,
      });

      const response = await this.axiosInstance.post(
        `/webhook/set/${instanceName}`,
        webhookPayload
      );

      console.log("✅ Webhook configurado:", {
        instanceName,
        status: response.status,
        data: response.data,
      });

      // 3. Verificar se foi configurado corretamente
      await this.delay(1000); // Aguardar um pouco
      const verifyWebhook = await this.getWebhookConfig(instanceName);

      if (
        verifyWebhook &&
        verifyWebhook.webhook &&
        verifyWebhook.webhook.url === webhookUrl
      ) {
        console.log("✅ Webhook verificado e funcionando:", instanceName);
      } else {
        console.log("⚠️ Webhook pode não ter sido configurado corretamente:", {
          instanceName,
          expected: webhookUrl,
          actual: verifyWebhook?.webhook?.url || "não definido",
        });
      }
    } catch (error: any) {
      console.error("❌ Erro ao configurar webhook:", {
        instanceName,
        webhookUrl,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.response?.data?.message || error.message,
        errors:
          error.response?.data?.response?.message ||
          error.response?.data?.errors,
      });

      // Se erro 400, pode ser que a URL seja inválida
      if (error.response?.status === 400) {
        console.log("⚠️ Erro 400 no webhook - detalhes:", error.response?.data);
        console.log("⚠️ Tentando continuar sem webhook...");
        return; // Não falhar o processo todo por causa do webhook
      }

      throw error;
    }
  }

  /**
   * Obter configuração atual do webhook
   * @param instanceName Nome da instância
   * @returns Configuração do webhook
   */
  async getWebhookConfig(instanceName: string): Promise<any> {
    try {
      console.log("🔍 Obtendo configuração do webhook:", instanceName);

      const response = await this.axiosInstance.get(
        `/webhook/find/${instanceName}`
      );

      console.log("✅ Configuração do webhook obtida:", {
        instanceName,
        webhook: response.data,
      });

      return response.data;
    } catch (error: any) {
      // Se retornar 404, significa que não há webhook configurado
      if (error.response?.status === 404) {
        console.log("ℹ️ Nenhum webhook configurado para:", instanceName);
        return null;
      }

      console.error("❌ Erro ao obter webhook:", {
        instanceName,
        status: error.response?.status,
        message: error.response?.data?.message || error.message,
      });
      return null;
    }
  }

  /**
   * Validar se a URL do webhook é válida
   * @param webhookUrl URL do webhook
   * @returns true se válida
   */
  private isValidWebhookUrl(webhookUrl: string): boolean {
    try {
      const url = new URL(webhookUrl);

      // Verificar se não é localhost quando em produção
      if (
        process.env.NODE_ENV === "production" &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1")
      ) {
        console.log(
          "⚠️ Usando localhost em produção pode causar problemas no webhook"
        );
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Obter status da conexão da instância
   * @param instanceName Nome da instância
   * @returns Status da conexão
   */
  async getSessionStatus(
    instanceName: string
  ): Promise<EvolutionSessionStatus | null> {
    try {
      console.log("📊 Obtendo status da conexão:", instanceName);

      const response = await this.axiosInstance.get(
        `/instance/connectionState/${instanceName}`
      );

      console.log("✅ Status obtido:", {
        instanceName,
        state: response.data?.state,
      });

      return response.data;
    } catch (error: any) {
      console.error("❌ Erro ao obter status da conexão:", {
        instanceName,
        status: error.response?.status,
        message: error.response?.data?.message || error.message,
      });
      return null;
    }
  }

  /**
   * Desconectar instância
   * @param instanceName Nome da instância
   */
  async disconnectSession(instanceName: string): Promise<void> {
    try {
      console.log("🔌 Desconectando instância:", instanceName);

      await this.axiosInstance.delete(`/instance/logout/${instanceName}`);

      console.log("✅ Instância desconectada:", instanceName);
    } catch (error: any) {
      console.error("❌ Erro ao desconectar instância:", {
        instanceName,
        status: error.response?.status,
        message: error.response?.data?.message || error.message,
      });
      throw error;
    }
  }

  /**
   * Deletar instância
   * @param instanceName Nome da instância
   */
  async deleteSession(instanceName: string): Promise<void> {
    try {
      console.log("🗑️ Deletando instância:", instanceName);

      await this.axiosInstance.delete(`/instance/delete/${instanceName}`);

      console.log("✅ Instância deletada:", instanceName);
    } catch (error: any) {
      console.error("❌ Erro ao deletar instância:", {
        instanceName,
        status: error.response?.status,
        message: error.response?.data?.message || error.message,
      });
      throw error;
    }
  }

  /**
   * Enviar mensagem de texto
   * @param instanceName Nome da instância
   * @param phoneNumber Número do telefone
   * @param text Texto da mensagem
   * @returns Resultado do envio
   */
  async sendTextMessage(
    instanceName: string,
    phoneNumber: string,
    text: string
  ): Promise<any> {
    try {
      const payload: SendTextMessagePayload = {
        number: phoneNumber,
        text: text,
      };

      console.log("📤 Enviando mensagem:", {
        instanceName,
        phoneNumber,
        textLength: text.length,
      });

      const response = await this.axiosInstance.post(
        `/message/sendText/${instanceName}`,
        payload
      );

      console.log("✅ Mensagem enviada:", {
        instanceName,
        phoneNumber,
        messageId: response.data?.key?.id,
      });

      return response.data;
    } catch (error: any) {
      console.error("❌ Erro ao enviar mensagem:", {
        instanceName,
        phoneNumber,
        status: error.response?.status,
        message: error.response?.data?.message || error.message,
      });
      throw error;
    }
  }

  /**
   * Forçar geração de QR Code (conectar instância)
   * @param instanceName Nome da instância
   * @returns QR Code ou null
   */
  async forceQRCode(instanceName: string): Promise<string | null> {
    try {
      console.log("🔄 Forçando geração de QR Code:", instanceName);

      const response = await this.axiosInstance.get(
        `/instance/connect/${instanceName}`
      );

      const qrCode =
        response.data?.qrcode?.base64 || response.data?.qrCode || null;

      console.log("✅ QR Code forçado:", {
        instanceName,
        hasQrCode: !!qrCode,
        responseKeys: Object.keys(response.data || {}),
      });

      return qrCode;
    } catch (error: any) {
      console.error("❌ Erro ao forçar QR Code:", {
        instanceName,
        status: error.response?.status,
        message: error.response?.data?.message || error.message,
      });
      return null;
    }
  }

  /**
   * Obter QR Code da instância
   * @param instanceName Nome da instância
   * @returns QR Code em base64 ou null
   */
  async getQRCode(instanceName: string): Promise<string | null> {
    try {
      console.log("📱 Obtendo QR Code:", instanceName);

      const response = await this.axiosInstance.get(
        `/instance/connect/${instanceName}`
      );

      const qrCode = response.data?.qrcode?.base64 || null;

      console.log("✅ QR Code obtido:", {
        instanceName,
        hasQrCode: !!qrCode,
      });

      return qrCode;
    } catch (error: any) {
      console.error("❌ Erro ao obter QR Code:", {
        instanceName,
        status: error.response?.status,
        message: error.response?.data?.message || error.message,
      });
      return null;
    }
  }

  /**
   * Remover configuração do webhook
   * @param instanceName Nome da instância
   */
  async removeWebhook(instanceName: string): Promise<void> {
    try {
      console.log("🗑️ Removendo webhook:", instanceName);

      await this.axiosInstance.delete(`/webhook/set/${instanceName}`);

      console.log("✅ Webhook removido:", instanceName);
    } catch (error: any) {
      console.error("❌ Erro ao remover webhook:", {
        instanceName,
        status: error.response?.status,
        message: error.response?.data?.message || error.message,
      });
      // Não falhar se não conseguir remover
    }
  }

  /**
   * Utility para delay
   * @param ms Milissegundos para aguardar
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const evolutionService = new EvolutionService();
