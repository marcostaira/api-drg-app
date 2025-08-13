// src/services/whatsappService.ts
// Serviço principal WhatsApp com API Key por sessão

import { prisma } from "../config/database";
import { evolutionService } from "./evolutionService";
import { config } from "../config/config";
import { WhatsAppSessionStatus } from "@prisma/client";
import { logger } from "../utils/logger";
import type {
  WhatsAppConnectionResult,
  WhatsAppSessionStatus as IWhatsAppSessionStatus,
  WebhookData,
  QRCodeData,
  ConnectionUpdateData,
  MessageData,
} from "../types/whatsapp.types";
import type { SendTextMessageOptions } from "../types/evolution.types";

export class WhatsAppService {
  /**
   * Conectar tenant ao WhatsApp com verificações completas
   * @param tenantId ID do tenant
   * @param evolutionApiKey API Key específica do tenant/sessão
   * @returns Resultado da conexão
   */
  async connectTenant(
    tenantId: number,
    evolutionApiKey: string
  ): Promise<WhatsAppConnectionResult> {
    try {
      logger.info("Iniciando processo de conexão para tenant", { tenantId });

      // 1. Verificar se o tenant existe no banco
      const tenant = await this.verifyTenantExists(tenantId);
      if (!tenant) {
        throw new Error("Tenant não encontrado no banco de dados");
      }

      // 2. Verificar se já existe uma sessão ativa no banco
      const existingSession = await this.findActiveSession(tenantId);
      const sessionName = `tenant_${tenantId}`;
      const webhookUrl = `${config.webhookBaseUrl}/api/webhook/whatsapp/${tenantId}`;

      // 3. Verificar se a sessão existe no Evolution API
      const sessionExistsInEvolution = await evolutionService.checkSession(
        sessionName,
        evolutionApiKey
      );

      logger.debug("Status das verificações", {
        tenantId,
        tenantExists: !!tenant,
        sessionInDatabase: !!existingSession,
        sessionInEvolution: sessionExistsInEvolution,
      });

      // 4. Se não existe sessão no Evolution, criar
      if (!sessionExistsInEvolution) {
        await this.createEvolutionSession(
          sessionName,
          evolutionApiKey,
          webhookUrl
        );
      }

      // 5. Criar ou atualizar sessão no banco com API Key
      const session = await this.upsertDatabaseSession(
        tenantId,
        sessionName,
        evolutionApiKey,
        webhookUrl,
        existingSession
      );

      // 6. Obter QR Code se necessário
      const qrCode = await this.getQRCodeIfNeeded(
        sessionName,
        evolutionApiKey,
        session.status
      );

      if (qrCode) {
        await this.updateSessionQRCode(session.id, qrCode);
      }

      logger.info("Processo de conexão finalizado", {
        tenantId,
        sessionId: session.id,
        status: session.status,
        hasQrCode: !!qrCode,
      });

      return {
        sessionId: session.id,
        sessionName,
        status: session.status,
        qrCode: qrCode ?? undefined,
        webhookUrl,
      };
    } catch (error: any) {
      logger.error("Erro no processo de conexão", error, { tenantId });
      throw error;
    }
  }

  /**
   * Verificar se tenant existe no banco
   */
  private async verifyTenantExists(tenantId: number) {
    logger.debug("Verificando se tenant existe no banco", { tenantId });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (tenant) {
      logger.debug("Tenant encontrado no banco", { tenantId });
    } else {
      logger.warn("Tenant não encontrado no banco", { tenantId });
    }

    return tenant;
  }

  /**
   * Buscar sessão ativa no banco
   */
  private async findActiveSession(tenantId: number) {
    logger.debug("Buscando sessão ativa no banco", { tenantId });

    const session = await prisma.whatsAppSession.findFirst({
      where: {
        tenantId: tenantId,
        status: { in: ["CONNECTING", "CONNECTED"] },
      },
    });

    if (session) {
      logger.debug("Sessão ativa encontrada no banco", {
        tenantId,
        sessionId: session.id,
        status: session.status,
      });
    } else {
      logger.debug("Nenhuma sessão ativa no banco", { tenantId });
    }

    return session;
  }

  /**
   * Criar sessão no Evolution API
   */
  private async createEvolutionSession(
    sessionName: string,
    evolutionApiKey: string,
    webhookUrl: string
  ) {
    logger.info("Criando sessão no Evolution", { sessionName });

    try {
      // Criar nova sessão no Evolution
      await evolutionService.createSession(
        sessionName,
        evolutionApiKey,
        webhookUrl
      );

      // Aguardar um pouco para a sessão ser criada
      await this.delay(2000);

      // Configurar sessão (não aceitar grupos, não sincronizar histórico)
      await evolutionService.configureSession(sessionName, evolutionApiKey);

      // Tentar configurar webhook (não falhar se der erro)
      try {
        await evolutionService.configureWebhook(
          sessionName,
          evolutionApiKey,
          webhookUrl
        );
      } catch (webhookError: any) {
        logger.warn("Falha na configuração do webhook, mas continuando", {
          sessionName,
          error: webhookError.message,
        });
        // Não falhar o processo todo por causa do webhook
      }

      logger.info("Sessão criada e configurada no Evolution", { sessionName });
    } catch (error: any) {
      logger.error("Erro ao criar sessão no Evolution", error, { sessionName });
      throw error;
    }
  }

  /**
   * Criar ou atualizar sessão no banco com API Key
   */
  private async upsertDatabaseSession(
    tenantId: number,
    sessionName: string,
    evolutionApiKey: string,
    webhookUrl: string,
    existingSession: any
  ) {
    logger.debug("Criando/atualizando sessão no banco", {
      tenantId,
      sessionName,
      hasExisting: !!existingSession,
    });

    const session = await prisma.whatsAppSession.upsert({
      where: { sessionName },
      create: {
        tenantId,
        sessionName,
        evolutionApiKey, // Salvar API Key
        status: "CONNECTING",
        webhookUrl,
      },
      update: {
        status: "CONNECTING",
        evolutionApiKey, // Atualizar API Key se mudou
        webhookUrl,
        updatedAt: new Date(),
      },
    });

    logger.debug("Sessão salva no banco", {
      sessionId: session.id,
      status: session.status,
    });

    return session;
  }

  /**
   * Obter QR Code se necessário
   */
  private async getQRCodeIfNeeded(
    sessionName: string,
    evolutionApiKey: string,
    currentStatus: string
  ): Promise<string | null> {
    if (currentStatus === "CONNECTED") {
      logger.debug("Sessão já conectada, não precisa de QR Code", {
        sessionName,
      });
      return null;
    }

    logger.debug("Obtendo QR Code", { sessionName });
    return await evolutionService.getQRCode(sessionName, evolutionApiKey);
  }

  /**
   * Atualizar QR Code da sessão
   */
  private async updateSessionQRCode(sessionId: string, qrCode: string) {
    await prisma.whatsAppSession.update({
      where: { id: sessionId },
      data: { qrCode },
    });
    logger.debug("QR Code atualizado na sessão", { sessionId });
  }

  /**
   * Desconectar sessão
   */
  async disconnectSession(tenantId: number): Promise<void> {
    try {
      logger.info("Iniciando desconexão", { tenantId });

      const session = await prisma.whatsAppSession.findFirst({
        where: { tenantId },
      });

      if (!session) {
        throw new Error("Sessão não encontrada no banco de dados");
      }

      if (!session.evolutionApiKey) {
        throw new Error("API Key não configurada para esta sessão");
      }

      // Desconectar no Evolution
      await evolutionService.disconnectSession(
        session.sessionName,
        session.evolutionApiKey
      );

      // Atualizar status no banco
      await prisma.whatsAppSession.update({
        where: { id: session.id },
        data: {
          status: "DISCONNECTED",
          phoneNumber: null,
          profileName: null,
          qrCode: null,
          connectedAt: null,
        },
      });

      logger.info("Sessão desconectada", { tenantId });
    } catch (error: any) {
      logger.error("Erro ao desconectar sessão", error, { tenantId });
      throw error;
    }
  }

  /**
   * Obter status da sessão
   */
  async getSessionStatus(tenantId: number): Promise<IWhatsAppSessionStatus> {
    try {
      logger.debug("Obtendo status da sessão", { tenantId });

      const session = await prisma.whatsAppSession.findFirst({
        where: { tenantId },
      });

      if (!session) {
        return {
          connected: false,
          status: "DISCONNECTED",
          message: "Sessão não encontrada no banco de dados",
        };
      }

      if (!session.evolutionApiKey) {
        return {
          connected: false,
          status: session.status,
          message: "API Key não configurada para esta sessão",
        };
      }

      // Obter status do Evolution
      const evolutionStatus = await evolutionService.getSessionStatus(
        session.sessionName,
        session.evolutionApiKey
      );

      const sessionInfo = await evolutionService.getSessionInfo(
        session.sessionName,
        session.evolutionApiKey
      );

      logger.debug("Status obtido", {
        tenantId,
        dbStatus: session.status,
        evolutionState: evolutionStatus?.state,
      });

      return {
        connected: session.status === "CONNECTED",
        status: session.status,
        phoneNumber: session.phoneNumber ?? undefined,
        profileName: session.profileName ?? undefined,
        sessionName: session.sessionName,
        connectedAt: session.connectedAt ?? undefined,
        evolutionStatus: evolutionStatus?.state,
        sessionInfo,
      };
    } catch (error: any) {
      logger.error("Erro ao obter status da sessão", error, { tenantId });

      return {
        connected: false,
        status: "ERROR",
        error: "Erro ao conectar com Evolution API",
      };
    }
  }

  /**
   * Processar webhook do Evolution
   */
  async processWebhook(
    tenantId: number,
    webhookData: WebhookData
  ): Promise<void> {
    try {
      logger.webhook(webhookData.event, webhookData.data);

      const session = await prisma.whatsAppSession.findFirst({
        where: { tenantId },
      });

      if (!session) {
        logger.warn("Sessão não encontrada para webhook", { tenantId });
        return;
      }

      const { event, data = {} } = webhookData;

      switch (event) {
        case "qrcode.updated":
          await this.handleQRCodeUpdate(session.id, data);
          break;

        case "connection.update":
          await this.handleConnectionUpdate(session.id, data);
          break;

        case "messages.upsert":
          await this.handleMessageReceived(session.id, data);
          break;

        default:
          logger.debug("Evento não tratado", { event });
      }

      logger.debug("Webhook processado", { tenantId, event });
    } catch (error: any) {
      logger.error("Erro ao processar webhook", error, {
        tenantId,
        event: webhookData.event,
      });
    }
  }

  /**
   * Processar atualização de QR Code
   */
  private async handleQRCodeUpdate(
    sessionId: string,
    data: QRCodeData
  ): Promise<void> {
    if (data.qrCode) {
      await prisma.whatsAppSession.update({
        where: { id: sessionId },
        data: { qrCode: data.qrCode },
      });
      logger.debug("QR Code atualizado via webhook", { sessionId });
    }
  }

  /**
   * Processar atualização de conexão
   */
  private async handleConnectionUpdate(
    sessionId: string,
    data: ConnectionUpdateData
  ): Promise<void> {
    let status: WhatsAppSessionStatus = "DISCONNECTED";
    let phoneNumber: string | null = null;
    let profileName: string | null = null;
    let connectedAt: Date | null = null;

    switch (data.state) {
      case "open":
        status = "CONNECTED";
        phoneNumber = data.user?.id || null;
        profileName = data.user?.name || null;
        connectedAt = new Date();
        logger.info("Conexão estabelecida", { sessionId });
        break;
      case "connecting":
        status = "CONNECTING";
        logger.debug("Conectando", { sessionId });
        break;
      case "close":
        status = "DISCONNECTED";
        logger.info("Conexão fechada", { sessionId });
        break;
    }

    await prisma.whatsAppSession.update({
      where: { id: sessionId },
      data: {
        status,
        phoneNumber,
        profileName,
        connectedAt,
        qrCode: status === "CONNECTED" ? null : undefined,
      },
    });
  }

  /**
   * Processar mensagem recebida (apenas texto)
   */
  private async handleMessageReceived(
    sessionId: string,
    data: MessageData
  ): Promise<void> {
    const messages = data.messages || [data];

    for (const message of messages) {
      try {
        // Ignorar mensagens que não são de texto
        if (message.messageType !== "textMessage") {
          continue;
        }

        // Ignorar mensagens enviadas por nós
        if (message.key?.fromMe) {
          continue;
        }

        // Ignorar mensagens de grupos
        if (message.key?.remoteJid?.includes("@g.us")) {
          continue;
        }

        const messageText =
          message.message?.conversation ||
          message.message?.extendedTextMessage?.text ||
          "";

        if (!messageText.trim()) {
          continue;
        }

        await prisma.receivedMessage.create({
          data: {
            whatsappSessionId: sessionId,
            messageId: message.key?.id || `${Date.now()}`,
            fromPhone:
              message.key?.remoteJid?.replace("@s.whatsapp.net", "") || "",
            fromName: message.pushName || null,
            messageText,
            messageType: "text",
            timestamp: new Date(message.messageTimestamp * 1000),
          },
        });

        logger.debug("Mensagem salva", {
          sessionId,
          fromPhone: message.key?.remoteJid?.replace("@s.whatsapp.net", ""),
          messageLength: messageText.length,
        });
      } catch (error) {
        logger.error("Erro ao salvar mensagem", error, {
          sessionId,
          messageId: message.key?.id,
        });
      }
    }
  }

  /**
   * Enviar mensagem de texto
   */
  async sendMessage(
    tenantId: number,
    phoneNumber: string,
    text: string,
    options?: SendTextMessageOptions
  ): Promise<any> {
    try {
      logger.debug("Iniciando envio de mensagem", {
        tenantId,
        phoneNumber,
        textLength: text.length,
      });

      const session = await prisma.whatsAppSession.findFirst({
        where: {
          tenantId,
          status: "CONNECTED",
        },
      });

      if (!session) {
        throw new Error(
          "Sessão não conectada. Conecte-se ao WhatsApp primeiro."
        );
      }

      if (!session.evolutionApiKey) {
        throw new Error("API Key não configurada para esta sessão");
      }

      // Formatar número de telefone
      const formattedNumber = phoneNumber.replace(/\D/g, "");

      const result = await evolutionService.sendTextMessage(
        session.sessionName,
        session.evolutionApiKey,
        formattedNumber,
        text,
        options
      );

      logger.info("Mensagem enviada", {
        tenantId,
        phoneNumber: formattedNumber,
        messageId: result?.key?.id,
      });

      return result;
    } catch (error: any) {
      logger.error("Erro ao enviar mensagem", error, {
        tenantId,
        phoneNumber,
      });
      throw error;
    }
  }

  /**
   * Obter QR Code manualmente
   */
  async getQRCodeManual(tenantId: number): Promise<string | null> {
    try {
      logger.debug("Obtendo QR Code manual para tenant", { tenantId });

      const session = await prisma.whatsAppSession.findFirst({
        where: { tenantId },
      });

      if (!session) {
        throw new Error("Sessão não encontrada no banco de dados");
      }

      // Primeiro tentar obter do banco (se veio via webhook)
      if (session.qrCode) {
        logger.debug("QR Code encontrado no banco", { tenantId });
        return session.qrCode;
      }

      if (!session.evolutionApiKey) {
        logger.warn("Sessão sem API Key configurada", { tenantId });
        return null;
      }

      // Se não tem no banco, tentar obter da Evolution API
      const qrCode = await evolutionService.getQRCode(
        session.sessionName,
        session.evolutionApiKey
      );

      if (qrCode) {
        // Salvar no banco para próximas consultas
        await prisma.whatsAppSession.update({
          where: { id: session.id },
          data: { qrCode },
        });
        logger.debug("QR Code obtido da Evolution e salvo no banco", {
          tenantId,
        });
      }

      return qrCode;
    } catch (error: any) {
      logger.error("Erro ao obter QR Code", error, { tenantId });
      return null;
    }
  }

  /**
   * Obter configuração do webhook
   */
  async getWebhookConfig(tenantId: number): Promise<any> {
    try {
      logger.debug("Obtendo configuração do webhook para tenant", { tenantId });

      const session = await prisma.whatsAppSession.findFirst({
        where: { tenantId },
      });

      if (!session) {
        throw new Error("Sessão não encontrada no banco de dados");
      }

      if (!session.evolutionApiKey) {
        logger.warn("Sessão sem API Key configurada", { tenantId });
        return null;
      }

      const webhookConfig = await evolutionService.getWebhookConfig(
        session.sessionName,
        session.evolutionApiKey
      );

      return webhookConfig;
    } catch (error: any) {
      logger.error("Erro ao obter configuração do webhook", error, {
        tenantId,
      });
      return null;
    }
  }

  /**
   * Utility para delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const whatsappService = new WhatsAppService();
