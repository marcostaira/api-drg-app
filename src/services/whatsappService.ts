// src/services/whatsappService.ts
// Serviço principal WhatsApp COMPLETO com todas as correções

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
   * Conectar tenant ao WhatsApp - USA API KEY DO .ENV
   * @param tenantId ID do tenant
   * @returns Resultado da conexão
   */
  async connectTenant(tenantId: number): Promise<WhatsAppConnectionResult> {
    try {
      logger.info("Iniciando processo de conexão para tenant", { tenantId });

      // 1. Usar API Key do .env (global)
      const evolutionApiKey = config.evolutionApiKey;
      if (!evolutionApiKey) {
        throw new Error("EVOLUTION_API_KEY não configurada no .env");
      }

      // 2. Verificar/criar client no banco
      const client = await this.ensureClientExists(tenantId);

      // 3. Criar tenant se não existir
      await this.ensureTenantExists(tenantId, client);

      // 4. Verificar se já existe uma sessão ativa no banco
      const existingSession = await this.findActiveSession(tenantId);
      const sessionName = `tenant_${tenantId}`;
      const webhookUrl = `${config.webhookBaseUrl}/api/webhook/whatsapp/${tenantId}`;

      // 5. Verificar se a sessão existe no Evolution API
      const sessionExistsInEvolution = await evolutionService.checkSession(
        sessionName,
        evolutionApiKey
      );

      logger.debug("Status das verificações", {
        tenantId,
        clientExists: !!client,
        sessionInDatabase: !!existingSession,
        sessionInEvolution: sessionExistsInEvolution,
      });

      // 6. Se não existe sessão no Evolution, criar
      if (!sessionExistsInEvolution) {
        await this.createEvolutionSession(
          sessionName,
          evolutionApiKey,
          webhookUrl
        );
      }

      // 7. Criar ou atualizar sessão no banco
      const session = await this.upsertDatabaseSession(
        tenantId,
        sessionName,
        evolutionApiKey,
        webhookUrl,
        existingSession
      );

      // 7.5. NOVO: Obter e salvar token da sessão
      const sessionToken = await this.getAndSaveSessionToken(
        session.id,
        sessionName,
        evolutionApiKey
      );

      // 8. Obter QR Code se necessário
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
        hasToken: !!sessionToken,
      });

      return {
        sessionId: session.id,
        sessionName,
        status: session.status,
        qrCode: qrCode ?? undefined,
        webhookUrl,
        sessionToken: sessionToken ?? undefined, // CORRIGIDO: converter null para undefined
        evolutionApiKey,
      };
    } catch (error: any) {
      logger.error("Erro no processo de conexão", error, { tenantId });
      throw error;
    }
  }

  /**
   * Garantir que client existe no banco (criar se não existir)
   */
  private async ensureClientExists(tenantId: number) {
    logger.debug("Verificando/criando client no banco", { tenantId });

    // Tentar buscar client existente
    let client = await prisma.ofClient.findUnique({
      where: { id: tenantId },
    });

    if (client) {
      logger.debug("Client encontrado no banco", {
        tenantId,
        clientName: client.clientName || client.friendlyName,
      });
      return client;
    }

    // Client não existe, criar automaticamente
    logger.info("Client não encontrado, criando automaticamente", { tenantId });

    try {
      client = await prisma.ofClient.create({
        data: {
          id: tenantId,
          clientName: `Cliente ${tenantId}`,
          friendlyName: `Tenant ${tenantId}`,
          active: true,
          waactive: true,
          dateAdd: new Date(),
          dateLastupdate: new Date(),
        },
      });

      logger.info("Client criado automaticamente", {
        tenantId,
        clientName: client.clientName,
      });

      return client;
    } catch (error: any) {
      logger.error("Erro ao criar client automaticamente", error, { tenantId });
      throw new Error(`Falha ao criar client ${tenantId}: ${error.message}`);
    }
  }

  /**
   * Garantir que tenant existe na tabela tenants
   */
  private async ensureTenantExists(tenantId: number, client: any) {
    try {
      // Verificar se já existe (usando String)
      const existingTenant = await prisma.tenant.findUnique({
        where: { id: tenantId.toString() }, // Converter para String
      });

      if (existingTenant) {
        logger.debug("Tenant já existe", { tenantId });
        return existingTenant;
      }

      // Criar tenant na tabela tenants (usando String)
      const tenant = await prisma.tenant.create({
        data: {
          id: tenantId.toString(), // Converter para String
          name:
            client.clientName || client.friendlyName || `Tenant ${tenantId}`,
          active: client.active || true,
        },
      });

      logger.info("Tenant criado automaticamente", {
        tenantId,
        tenantName: tenant.name,
      });

      return tenant;
    } catch (error: any) {
      if (error.code === "P2002") {
        // Tenant já existe (unique constraint), ok
        logger.debug("Tenant já existe (constraint), continuando", {
          tenantId,
        });
        return;
      }
      throw error;
    }
  }

  /**
   * Buscar sessão ativa no banco (usando String)
   */
  private async findActiveSession(tenantId: number) {
    logger.debug("Buscando sessão ativa no banco", { tenantId });

    const session = await prisma.whatsAppSession.findFirst({
      where: {
        tenantId: tenantId.toString(), // Converter para String
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
   * Criar ou atualizar sessão no banco (usando String)
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
        tenantId: tenantId.toString(), // Converter para String
        sessionName,
        evolutionApiKey,
        status: "CONNECTING",
        webhookUrl,
      },
      update: {
        status: "CONNECTING",
        evolutionApiKey,
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
   * Obter e salvar token da sessão
   */
  private async getAndSaveSessionToken(
    sessionId: string,
    sessionName: string,
    evolutionApiKey: string
  ): Promise<string | null> {
    try {
      logger.debug("Obtendo token da sessão", { sessionName });

      // Aguardar um pouco para garantir que a sessão foi criada
      await this.delay(3000);

      const sessionToken = await evolutionService.getSessionToken(
        sessionName,
        evolutionApiKey
      );

      if (sessionToken) {
        // Salvar token no banco
        await prisma.whatsAppSession.update({
          where: { id: sessionId },
          data: { sessionToken },
        });

        logger.info("Token da sessão salvo no banco", {
          sessionName,
          tokenPrefix: sessionToken.substring(0, 8) + "...",
        });

        return sessionToken;
      }

      logger.warn("Token da sessão não encontrado", { sessionName });
      return null;
    } catch (error: any) {
      logger.error("Erro ao obter token da sessão", error, { sessionName });
      return null;
    }
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
   * Desconectar sessão (usando String)
   */
  async disconnectSession(tenantId: number): Promise<void> {
    try {
      logger.info("Iniciando desconexão", { tenantId });

      const session = await prisma.whatsAppSession.findFirst({
        where: { tenantId: tenantId.toString() }, // Converter para String
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
          sessionToken: null,
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
   * Obter status da sessão (CORRIGIDO com fetchInstances)
   */
  async getSessionStatus(tenantId: number): Promise<IWhatsAppSessionStatus> {
    try {
      logger.debug("Obtendo status da sessão", { tenantId });

      const session = await prisma.whatsAppSession.findFirst({
        where: { tenantId: tenantId.toString() }, // Converter para String
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

      // CORRIGIDO: Usar fetchInstances em vez de getSessionInfo
      const sessionInfo = await evolutionService.getSessionInfo(
        session.sessionName,
        session.evolutionApiKey
      );

      // Se não tem token salvo, tentar obter e salvar
      if (!session.sessionToken && sessionInfo?.token) {
        await prisma.whatsAppSession.update({
          where: { id: session.id },
          data: { sessionToken: sessionInfo.token },
        });
        logger.info("Token da sessão atualizado via status", {
          sessionName: session.sessionName,
          tokenPrefix: sessionInfo.token.substring(0, 8) + "...",
        });
      }

      logger.debug("Status obtido", {
        tenantId,
        dbStatus: session.status,
        evolutionState: evolutionStatus?.state,
        connectionStatus: sessionInfo?.connectionStatus,
      });

      return {
        connected: session.status === "CONNECTED",
        status: session.status,
        phoneNumber: session.phoneNumber ?? undefined,
        profileName: session.profileName ?? undefined,
        sessionName: session.sessionName,
        sessionToken: session.sessionToken ?? sessionInfo?.token ?? undefined, // CORRIGIDO
        connectedAt: session.connectedAt ?? undefined,
        evolutionStatus: evolutionStatus?.state,
        connectionStatus: sessionInfo?.connectionStatus,
        ownerJid: sessionInfo?.ownerJid,
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
   * Processar webhook do Evolution (usando String)
   */
  async processWebhook(
    tenantId: number,
    webhookData: WebhookData
  ): Promise<void> {
    try {
      logger.webhook(webhookData.event, webhookData.data);

      const session = await prisma.whatsAppSession.findFirst({
        where: { tenantId: tenantId.toString() }, // Converter para String
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
        logger.info("Conexão estabelecida via webhook", { sessionId });
        break;
      case "connecting":
        status = "CONNECTING";
        logger.debug("Conectando via webhook", { sessionId });
        break;
      case "close":
        status = "DISCONNECTED";
        logger.info("Conexão fechada via webhook", { sessionId });
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

        logger.debug("Mensagem salva via webhook", {
          sessionId,
          fromPhone: message.key?.remoteJid?.replace("@s.whatsapp.net", ""),
          messageLength: messageText.length,
        });
      } catch (error) {
        logger.error("Erro ao salvar mensagem recebida", error, {
          sessionId,
          messageId: message.key?.id,
        });
      }
    }
  }

  /**
   * Enviar mensagem de texto - CORRIGIDO para buscar qualquer sessão ativa
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

      // CORRIGIDO: Buscar qualquer sessão ativa, priorizando CONNECTED
      const session = await prisma.whatsAppSession.findFirst({
        where: {
          tenantId: tenantId.toString(),
          status: { in: ["CONNECTED", "CONNECTING"] }, // Aceitar CONNECTING também
        },
        orderBy: [
          {
            status: "asc", // CONNECTED vem antes de CONNECTING
          },
          {
            connectedAt: "desc", // Mais recente primeiro
          },
        ],
      });

      if (!session) {
        throw new Error(
          `Nenhuma sessão WhatsApp encontrada para tenant ${tenantId}. Execute a conexão primeiro.`
        );
      }

      // Verificar se está realmente conectada
      if (session.status !== "CONNECTED") {
        throw new Error(
          `Sessão WhatsApp não está conectada (status: ${session.status}). Aguarde a conexão ser estabelecida.`
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

      logger.info("Mensagem enviada com sucesso", {
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
   * Obter QR Code manualmente (usando String)
   */
  async getQRCodeManual(tenantId: number): Promise<string | null> {
    try {
      logger.debug("Obtendo QR Code manual para tenant", { tenantId });

      const session = await prisma.whatsAppSession.findFirst({
        where: { tenantId: tenantId.toString() }, // Converter para String
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
   * Obter configuração do webhook (usando String)
   */
  async getWebhookConfig(tenantId: number): Promise<any> {
    try {
      logger.debug("Obtendo configuração do webhook para tenant", { tenantId });

      const session = await prisma.whatsAppSession.findFirst({
        where: { tenantId: tenantId.toString() }, // Converter para String
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
   * Obter token da sessão
   */
  async getSessionToken(tenantId: number): Promise<string | null> {
    try {
      logger.debug("Obtendo token da sessão para tenant", { tenantId });

      const session = await prisma.whatsAppSession.findFirst({
        where: { tenantId: tenantId.toString() },
      });

      if (!session) {
        throw new Error("Sessão não encontrada no banco de dados");
      }

      // Se já tem token salvo, retornar
      if (session.sessionToken) {
        logger.debug("Token encontrado no banco", { tenantId });
        return session.sessionToken;
      }

      // Se não tem token, tentar obter da Evolution API
      if (session.evolutionApiKey) {
        const token = await evolutionService.getSessionToken(
          session.sessionName,
          session.evolutionApiKey
        );

        if (token) {
          // Salvar token no banco
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { sessionToken: token },
          });

          logger.info("Token obtido da Evolution e salvo", {
            tenantId,
            tokenPrefix: token.substring(0, 8) + "...",
          });

          return token;
        }
      }

      logger.warn("Token não disponível para esta sessão", { tenantId });
      return null;
    } catch (error: any) {
      logger.error("Erro ao obter token da sessão", error, { tenantId });
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
