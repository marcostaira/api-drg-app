// src/services/evolutionService.ts
// Serviço para integração com Evolution API v2 - CORRIGIDO com fetchInstances

import axios, { AxiosInstance, AxiosError } from "axios";
import { config } from "../config/config";
import { logger } from "../utils/logger";
import type {
  EvolutionInstance,
  EvolutionCreateInstancePayload,
  EvolutionWebhookConfig,
  EvolutionSettings,
  EvolutionSessionStatus,
  EvolutionSessionInfo,
  SendTextMessagePayload,
  SendTextMessageOptions,
  EvolutionInstanceData, // Novo tipo
} from "../types/evolution.types";

export class EvolutionService {
  private baseURL: string;

  constructor() {
    this.baseURL = config.evolutionApiUrl;
  }

  /**
   * Criar headers com API Key específica
   */
  private getHeaders(apiKey: string): Record<string, string> {
    return {
      apikey: apiKey,
      "Content-Type": "application/json",
    };
  }

  /**
   * Criar instância do axios com API Key específica
   */
  private createAxiosInstance(apiKey: string): AxiosInstance {
    return axios.create({
      baseURL: this.baseURL,
      headers: this.getHeaders(apiKey),
      timeout: 30000,
    });
  }

  /**
   * Verifica se a instância existe no Evolution API
   */
  async checkSession(instanceName: string, apiKey: string): Promise<boolean> {
    try {
      logger.evolution("CHECK_SESSION", instanceName, { checking: true });

      const axiosInstance = this.createAxiosInstance(apiKey);
      const response = await axiosInstance.get(`/instance/${instanceName}`);

      logger.evolution("SESSION_FOUND", instanceName, {
        status: response.status,
        instanceStatus: response.data?.instance?.status,
      });

      return response.status === 200;
    } catch (error: any) {
      const axiosError = error as AxiosError;

      if (axiosError.response?.status === 404) {
        logger.evolution("SESSION_NOT_FOUND", instanceName);
        return false;
      }

      if (axiosError.response?.status === 403) {
        logger.evolution("SESSION_FORBIDDEN", instanceName);
        return true; // Existe mas sem acesso
      }

      logger.evolution("CHECK_SESSION_ERROR", instanceName, undefined, error);
      return false;
    }
  }

  /**
   * Obter informações detalhadas da instância via fetchInstances
   */
  async getSessionInfo(
    instanceName: string,
    apiKey: string
  ): Promise<EvolutionInstanceData | null> {
    try {
      logger.evolution("GET_SESSION_INFO", instanceName);

      const axiosInstance = this.createAxiosInstance(apiKey);

      // Usar fetchInstances com filtro por nome
      const response = await axiosInstance.get(
        `/instance/fetchInstances?name=${instanceName}`
      );

      if (
        response.data &&
        Array.isArray(response.data) &&
        response.data.length > 0
      ) {
        const instanceData = response.data[0]; // Primeiro resultado

        logger.evolution("SESSION_INFO_RETRIEVED", instanceName, {
          token: instanceData.token ? "***" : "null",
          connectionStatus: instanceData.connectionStatus,
          ownerJid: instanceData.ownerJid,
        });

        return instanceData;
      }

      logger.evolution("SESSION_INFO_NOT_FOUND", instanceName);
      return null;
    } catch (error: any) {
      logger.evolution(
        "GET_SESSION_INFO_ERROR",
        instanceName,
        undefined,
        error
      );
      return null;
    }
  }

  /**
   * Obter token da sessão específico
   */
  async getSessionToken(
    instanceName: string,
    apiKey: string
  ): Promise<string | null> {
    try {
      logger.evolution("GET_SESSION_TOKEN", instanceName);

      const sessionInfo = await this.getSessionInfo(instanceName, apiKey);

      if (sessionInfo && sessionInfo.token) {
        logger.evolution("SESSION_TOKEN_RETRIEVED", instanceName, {
          hasToken: true,
        });
        return sessionInfo.token;
      }

      logger.evolution("SESSION_TOKEN_NOT_FOUND", instanceName);
      return null;
    } catch (error: any) {
      logger.evolution(
        "GET_SESSION_TOKEN_ERROR",
        instanceName,
        undefined,
        error
      );
      return null;
    }
  }

  /**
   * Criar nova instância no Evolution API
   */
  async createSession(
    instanceName: string,
    apiKey: string,
    webhookUrl?: string
  ): Promise<any> {
    try {
      const payload: EvolutionCreateInstancePayload = {
        instanceName,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
      };

      logger.evolution("CREATE_SESSION", instanceName, {
        integration: payload.integration,
      });

      const axiosInstance = this.createAxiosInstance(apiKey);
      const response = await axiosInstance.post("/instance/create", payload);

      logger.evolution("SESSION_CREATED", instanceName, {
        status: response.status,
      });

      return response.data;
    } catch (error: any) {
      const axiosError = error as AxiosError;

      if (axiosError.response?.status === 403) {
        logger.evolution("SESSION_ALREADY_EXISTS", instanceName);
        return {
          instance: { instanceName, status: "existing" },
          message: "Instance already exists",
        };
      }

      logger.evolution("CREATE_SESSION_ERROR", instanceName, undefined, error);
      throw error;
    }
  }

  /**
   * Configurar instância (rejeitar grupos, não sincronizar histórico, etc.)
   */
  async configureSession(instanceName: string, apiKey: string): Promise<void> {
    try {
      const settings: EvolutionSettings = {
        rejectCall: false,
        msgCall:
          "Não atendemos chamadas por aqui. Por favor, envie uma mensagem.",
        groupsIgnore: true,
        alwaysOnline: false,
        readMessages: false,
        readStatus: false,
        syncFullHistory: false,
      };

      logger.evolution("CONFIGURE_SESSION", instanceName, settings);

      const axiosInstance = this.createAxiosInstance(apiKey);
      await axiosInstance.post(`/settings/set/${instanceName}`, settings);

      logger.evolution("SESSION_CONFIGURED", instanceName);
    } catch (error: any) {
      logger.evolution(
        "CONFIGURE_SESSION_ERROR",
        instanceName,
        undefined,
        error
      );
      throw error;
    }
  }

  /**
   * Configurar webhook da instância
   */
  async configureWebhook(
    instanceName: string,
    apiKey: string,
    webhookUrl: string
  ): Promise<void> {
    try {
      // Validar URL do webhook
      if (!this.isValidWebhookUrl(webhookUrl)) {
        logger.warn("URL do webhook pode ser inválida", { webhookUrl });
      }

      // Verificar webhook existente
      const existingWebhook = await this.getWebhookConfig(instanceName, apiKey);

      if (
        existingWebhook?.webhook?.url === webhookUrl &&
        existingWebhook?.webhook?.enabled
      ) {
        logger.evolution("WEBHOOK_ALREADY_CONFIGURED", instanceName, {
          webhookUrl,
        });
        return;
      }

      // Configurar webhook
      const webhookPayload = {
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: true,
          webhookBase64: true,
          events: ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT"],
        },
      };

      logger.evolution("CONFIGURE_WEBHOOK", instanceName, webhookPayload);

      const axiosInstance = this.createAxiosInstance(apiKey);
      const response = await axiosInstance.post(
        `/webhook/set/${instanceName}`,
        webhookPayload
      );

      logger.evolution("WEBHOOK_CONFIGURED", instanceName, response.data);

      // Verificar configuração
      await this.delay(1000);
      const verifyWebhook = await this.getWebhookConfig(instanceName, apiKey);

      if (verifyWebhook?.webhook?.url !== webhookUrl) {
        logger.warn("Webhook pode não ter sido configurado corretamente", {
          instanceName,
          expected: webhookUrl,
          actual: verifyWebhook?.webhook?.url,
        });
      }
    } catch (error: any) {
      const axiosError = error as AxiosError;

      if (axiosError.response?.status === 400) {
        logger.warn("Erro 400 no webhook - continuando sem webhook", {
          instanceName,
          webhookUrl,
        });
        return;
      }

      logger.evolution(
        "CONFIGURE_WEBHOOK_ERROR",
        instanceName,
        undefined,
        error
      );
      throw error;
    }
  }

  /**
   * Obter configuração atual do webhook
   */
  async getWebhookConfig(instanceName: string, apiKey: string): Promise<any> {
    try {
      const axiosInstance = this.createAxiosInstance(apiKey);
      const response = await axiosInstance.get(`/webhook/find/${instanceName}`);

      logger.evolution("WEBHOOK_CONFIG_RETRIEVED", instanceName, response.data);
      return response.data;
    } catch (error: any) {
      const axiosError = error as AxiosError;

      if (axiosError.response?.status === 404) {
        logger.evolution("NO_WEBHOOK_CONFIGURED", instanceName);
        return null;
      }

      logger.evolution(
        "GET_WEBHOOK_CONFIG_ERROR",
        instanceName,
        undefined,
        error
      );
      return null;
    }
  }

  /**
   * Validar se a URL do webhook é válida
   */
  private isValidWebhookUrl(webhookUrl: string): boolean {
    try {
      const url = new URL(webhookUrl);

      if (
        config.nodeEnv === "production" &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1")
      ) {
        logger.warn(
          "Usando localhost em produção pode causar problemas no webhook"
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
   */
  async getSessionStatus(
    instanceName: string,
    apiKey: string
  ): Promise<EvolutionSessionStatus | null> {
    try {
      const axiosInstance = this.createAxiosInstance(apiKey);
      const response = await axiosInstance.get(
        `/instance/connectionState/${instanceName}`
      );

      logger.evolution("SESSION_STATUS_RETRIEVED", instanceName, {
        state: response.data?.state,
      });

      return response.data;
    } catch (error: any) {
      logger.evolution(
        "GET_SESSION_STATUS_ERROR",
        instanceName,
        undefined,
        error
      );
      return null;
    }
  }

  /**
   * Desconectar instância
   */
  async disconnectSession(instanceName: string, apiKey: string): Promise<void> {
    try {
      logger.evolution("DISCONNECT_SESSION", instanceName);

      const axiosInstance = this.createAxiosInstance(apiKey);
      await axiosInstance.delete(`/instance/logout/${instanceName}`);

      logger.evolution("SESSION_DISCONNECTED", instanceName);
    } catch (error: any) {
      logger.evolution(
        "DISCONNECT_SESSION_ERROR",
        instanceName,
        undefined,
        error
      );
      throw error;
    }
  }

  /**
   * Deletar instância
   */
  async deleteSession(instanceName: string, apiKey: string): Promise<void> {
    try {
      logger.evolution("DELETE_SESSION", instanceName);

      const axiosInstance = this.createAxiosInstance(apiKey);
      await axiosInstance.delete(`/instance/delete/${instanceName}`);

      logger.evolution("SESSION_DELETED", instanceName);
    } catch (error: any) {
      logger.evolution("DELETE_SESSION_ERROR", instanceName, undefined, error);
      throw error;
    }
  }

  /**
   * Enviar mensagem de texto - CORRIGIDO sem campos vazios
   */
  async sendTextMessage(
    instanceName: string,
    apiKey: string,
    phoneNumber: string,
    text: string,
    options?: SendTextMessageOptions
  ): Promise<any> {
    try {
      // Validar inputs
      if (!instanceName || !apiKey || !phoneNumber || !text) {
        throw new Error(
          "Parâmetros obrigatórios faltando para envio de mensagem"
        );
      }

      // Garantir que o número está no formato correto (apenas números)
      const cleanNumber = phoneNumber.replace(/\D/g, "");

      // PAYLOAD MÍNIMO - apenas campos obrigatórios
      const payload: any = {
        number: cleanNumber,
        text: text.trim(),
      };

      // Adicionar campos opcionais APENAS se tiverem valores válidos
      if (options?.delay && options.delay > 0) {
        payload.delay = options.delay;
      }

      if (options?.linkPreview === true) {
        payload.linkPreview = true;
      }

      if (options?.mentionsEveryOne === true) {
        payload.mentionsEveryOne = true;
      }

      // IMPORTANTE: só adicionar mentioned se tiver valores
      if (options?.mentioned && options.mentioned.length > 0) {
        payload.mentioned = options.mentioned;
      }

      // IMPORTANTE: só adicionar quoted se existir
      if (options?.quoted) {
        payload.quoted = options.quoted;
      }

      logger.info("Preparando envio de mensagem", {
        instanceName,
        phoneNumber: cleanNumber,
        textLength: text.length,
        fieldsCount: Object.keys(payload).length,
      });

      const axiosInstance = this.createAxiosInstance(apiKey);
      const url = `/message/sendText/${instanceName}`;

      logger.debug("Dados da requisição Evolution", {
        url: `${this.baseURL}${url}`,
        payload,
        headers: { apikey: apiKey.substring(0, 8) + "..." },
      });

      const response = await axiosInstance.post(url, payload);

      logger.info("Mensagem enviada com sucesso via Evolution", {
        instanceName,
        phoneNumber: cleanNumber,
        messageId: response.data?.key?.id,
        status: response.status,
      });

      return response.data;
    } catch (error: any) {
      const axiosError = error as AxiosError;

      // Log detalhado do erro
      if (axiosError.response) {
        logger.error("Erro na Evolution API - Response", {
          instanceName,
          phoneNumber,
          status: axiosError.response.status,
          statusText: axiosError.response.statusText,
          data: axiosError.response.data,
          url: axiosError.config?.url,
        });
      } else if (axiosError.request) {
        logger.error("Erro na Evolution API - Request", {
          instanceName,
          phoneNumber,
          message: "Nenhuma resposta recebida",
          url: axiosError.config?.url,
        });
      } else {
        logger.error("Erro na Evolution API - Config", {
          instanceName,
          phoneNumber,
          message: axiosError.message,
        });
      }

      logger.evolution(
        "SEND_MESSAGE_ERROR",
        instanceName,
        {
          phoneNumber,
          errorStatus: axiosError.response?.status,
          errorMessage: axiosError.message,
        },
        error
      );

      throw error;
    }
  }

  /**
   * Forçar geração de QR Code (conectar instância)
   */
  async forceQRCode(
    instanceName: string,
    apiKey: string
  ): Promise<string | null> {
    try {
      logger.evolution("FORCE_QR_CODE", instanceName);

      const axiosInstance = this.createAxiosInstance(apiKey);
      const response = await axiosInstance.get(
        `/instance/connect/${instanceName}`
      );

      const qrCode =
        response.data?.qrcode?.base64 || response.data?.qrCode || null;

      logger.evolution("QR_CODE_FORCED", instanceName, { hasQrCode: !!qrCode });
      return qrCode;
    } catch (error: any) {
      logger.evolution("FORCE_QR_CODE_ERROR", instanceName, undefined, error);
      return null;
    }
  }

  /**
   * Obter QR Code da instância
   */
  async getQRCode(
    instanceName: string,
    apiKey: string
  ): Promise<string | null> {
    try {
      const axiosInstance = this.createAxiosInstance(apiKey);
      const response = await axiosInstance.get(
        `/instance/connect/${instanceName}`
      );

      const qrCode = response.data?.qrcode?.base64 || null;

      logger.evolution("QR_CODE_RETRIEVED", instanceName, {
        hasQrCode: !!qrCode,
      });
      return qrCode;
    } catch (error: any) {
      logger.evolution("GET_QR_CODE_ERROR", instanceName, undefined, error);
      return null;
    }
  }

  /**
   * Remover configuração do webhook
   */
  async removeWebhook(instanceName: string, apiKey: string): Promise<void> {
    try {
      logger.evolution("REMOVE_WEBHOOK", instanceName);

      const axiosInstance = this.createAxiosInstance(apiKey);
      await axiosInstance.delete(`/webhook/set/${instanceName}`);

      logger.evolution("WEBHOOK_REMOVED", instanceName);
    } catch (error: any) {
      logger.evolution("REMOVE_WEBHOOK_ERROR", instanceName, undefined, error);
      // Não falhar se não conseguir remover
    }
  }

  /**
   * Utility para delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Exportar como singleton sem API key (será passada em cada método)
export const evolutionService = new EvolutionService();
