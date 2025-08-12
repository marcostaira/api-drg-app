// src/services/whatsappService.ts
// Serviço principal WhatsApp com verificações melhoradas

import { prisma } from "../config/database";
import { evolutionService } from "./evolutionService";
import { config } from "../config/config";
import { WhatsAppSessionStatus } from "@prisma/client";
import type {
  WhatsAppConnectionResult,
  WhatsAppSessionStatus as IWhatsAppSessionStatus,
  WebhookData,
  QRCodeData,
  ConnectionUpdateData,
  MessageData,
} from "../types/whatsapp.types";

export class WhatsAppService {
  /**
   * Conectar tenant ao WhatsApp com verificações completas
   * @param tenantId ID do tenant
   * @returns Resultado da conexão
   */
  async connectTenant(tenantId: number): Promise<WhatsAppConnectionResult> {
    try {
      console.log("🚀 Iniciando processo de conexão para tenant:", tenantId);

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
        sessionName
      );

      console.log("📊 Status das verificações:", {
        tenantId,
        tenantExists: !!tenant,
        sessionInDatabase: !!existingSession,
        sessionInEvolution: sessionExistsInEvolution,
      });

      // 4. Se não existe sessão no Evolution, criar
      if (!sessionExistsInEvolution) {
        await this.createEvolutionSession(sessionName, webhookUrl);
      }

      // 5. Criar ou atualizar sessão no banco
      const session = await this.upsertDatabaseSession(
        tenantId,
        sessionName,
        webhookUrl,
        existingSession
      );

      // 6. Obter QR Code se necessário
      const qrCode = await this.getQRCodeIfNeeded(sessionName, session.status);

      if (qrCode) {
        await this.updateSessionQRCode(session.id, qrCode);
      }

      console.log("✅ Processo de conexão finalizado:", {
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
      console.error("❌ Erro no processo de conexão:", {
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Verificar se tenant existe no banco
   * @param tenantId ID do tenant
   * @returns Tenant ou null
   */
  private async verifyTenantExists(tenantId: number) {
    console.log("🔍 Verificando se tenant existe no banco:", tenantId);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (tenant) {
      console.log("✅ Tenant encontrado no banco:", tenantId);
    } else {
      console.log("❌ Tenant não encontrado no banco:", tenantId);
    }

    return tenant;
  }

  /**
   * Buscar sessão ativa no banco
   * @param tenantId ID do tenant
   * @returns Sessão ativa ou null
   */
  private async findActiveSession(tenantId: number) {
    console.log("🔍 Buscando sessão ativa no banco:", tenantId);

    const session = await prisma.whatsAppSession.findFirst({
      where: {
        tenantId: tenantId,
        status: { in: ["CONNECTING", "CONNECTED"] },
      },
    });

    if (session) {
      console.log("✅ Sessão ativa encontrada no banco:", {
        tenantId,
        sessionId: session.id,
        status: session.status,
      });
    } else {
      console.log("❌ Nenhuma sessão ativa no banco:", tenantId);
    }

    return session;
  }

  /**
   * Criar sessão no Evolution API
   * @param sessionName Nome da sessão
   * @param webhookUrl URL do webhook
   */
  private async createEvolutionSession(
    sessionName: string,
    webhookUrl: string
  ) {
    console.log("🚀 Criando sessão no Evolution:", sessionName);

    try {
      // Criar nova sessão no Evolution
      await evolutionService.createSession(sessionName, webhookUrl);

      // Aguardar um pouco para a sessão ser criada
      await this.delay(2000);

      // Configurar sessão (não aceitar grupos, não sincronizar histórico)
      await evolutionService.configureSession(sessionName);

      // Tentar configurar webhook (não falhar se der erro)
      try {
        await evolutionService.configureWebhook(sessionName, webhookUrl);
      } catch (webhookError: any) {
        console.log("⚠️ Falha na configuração do webhook, mas continuando:", {
          sessionName,
          error: webhookError.message,
        });
        // Não falhar o processo todo por causa do webhook
      }

      console.log("✅ Sessão criada e configurada no Evolution:", sessionName);
    } catch (error: any) {
      console.error("❌ Erro ao criar sessão no Evolution:", {
        sessionName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Criar ou atualizar sessão no banco
   * @param tenantId ID do tenant
   * @param sessionName Nome da sessão
   * @param webhookUrl URL do webhook
   * @param existingSession Sessão existente ou null
   * @returns Sessão do banco
   */
  private async upsertDatabaseSession(
    tenantId: number,
    sessionName: string,
    webhookUrl: string,
    existingSession: any
  ) {
    console.log("💾 Criando/atualizando sessão no banco:", {
      tenantId,
      sessionName,
      hasExisting: !!existingSession,
    });

    const session = await prisma.whatsAppSession.upsert({
      where: { sessionName },
      create: {
        tenantId,
        sessionName,
        status: "CONNECTING",
        webhookUrl,
      },
      update: {
        status: "CONNECTING",
        webhookUrl,
        updatedAt: new Date(),
      },
    });

    console.log("✅ Sessão salva no banco:", {
      sessionId: session.id,
      status: session.status,
    });

    return session;
  }

  /**
   * Obter QR Code se necessário
   * @param sessionName Nome da sessão
   * @param currentStatus Status atual da sessão
   * @returns QR Code ou null
   */
  private async getQRCodeIfNeeded(
    sessionName: string,
    currentStatus: string
  ): Promise<string | null> {
    if (currentStatus === "CONNECTED") {
      console.log(
        "⏭️ Sessão já conectada, não precisa de QR Code:",
        sessionName
      );
      return null;
    }

    console.log("📱 Obtendo QR Code:", sessionName);
    return await evolutionService.getQRCode(sessionName);
  }

  /**
   * Atualizar QR Code da sessão
   * @param sessionId ID da sessão
   * @param qrCode QR Code
   */
  private async updateSessionQRCode(sessionId: string, qrCode: string) {
    await prisma.whatsAppSession.update({
      where: { id: sessionId },
      data: { qrCode },
    });
    console.log("✅ QR Code atualizado na sessão:", sessionId);
  }

  /**
   * Desconectar sessão
   * @param tenantId ID do tenant
   */
  async disconnectSession(tenantId: number): Promise<void> {
    try {
      console.log("🔌 Iniciando desconexão:", tenantId);

      const session = await prisma.whatsAppSession.findFirst({
        where: { tenantId },
      });

      if (!session) {
        throw new Error("Sessão não encontrada no banco de dados");
      }

      // Desconectar no Evolution
      await evolutionService.disconnectSession(session.sessionName);

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

      console.log("✅ Sessão desconectada:", tenantId);
    } catch (error: any) {
      console.error("❌ Erro ao desconectar sessão:", {
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Obter status da sessão
   * @param tenantId ID do tenant
   * @returns Status da sessão
   */
  async getSessionStatus(tenantId: number): Promise<IWhatsAppSessionStatus> {
    try {
      console.log("📊 Obtendo status da sessão:", tenantId);

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

      // Obter status do Evolution
      const evolutionStatus = await evolutionService.getSessionStatus(
        session.sessionName
      );
      const sessionInfo = await evolutionService.getSessionInfo(
        session.sessionName
      );

      console.log("✅ Status obtido:", {
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
      console.error("❌ Erro ao obter status da sessão:", {
        tenantId,
        error: error.message,
      });

      return {
        connected: false,
        status: "ERROR",
        error: "Erro ao conectar com Evolution API",
      };
    }
  }

  /**
   * Processar webhook do Evolution
   * @param tenantId ID do tenant
   * @param webhookData Dados do webhook
   */
  async processWebhook(
    tenantId: number,
    webhookData: WebhookData
  ): Promise<void> {
    try {
      console.log("🎣 Processando webhook:", {
        tenantId,
        event: webhookData.event,
      });

      const session = await prisma.whatsAppSession.findFirst({
        where: { tenantId },
      });

      if (!session) {
        console.log("❌ Sessão não encontrada para webhook:", tenantId);
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
          console.log("⚠️ Evento não tratado:", event);
      }

      console.log("✅ Webhook processado:", {
        tenantId,
        event,
      });
    } catch (error: any) {
      console.error("❌ Erro ao processar webhook:", {
        tenantId,
        event: webhookData.event,
        error: error.message,
      });
    }
  }

  /**
   * Processar atualização de QR Code
   * @param sessionId ID da sessão
   * @param data Dados do QR Code
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
      console.log("📱 QR Code atualizado via webhook:", sessionId);
    }
  }

  /**
   * Processar atualização de conexão
   * @param sessionId ID da sessão
   * @param data Dados da conexão
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
        console.log("✅ Conexão estabelecida:", sessionId);
        break;
      case "connecting":
        status = "CONNECTING";
        console.log("🔄 Conectando:", sessionId);
        break;
      case "close":
        status = "DISCONNECTED";
        console.log("❌ Conexão fechada:", sessionId);
        break;
    }

    await prisma.whatsAppSession.update({
      where: { id: sessionId },
      data: {
        status,
        phoneNumber,
        profileName,
        connectedAt,
        qrCode: status === "CONNECTED" ? null : undefined, // Limpar QR code quando conectar
      },
    });
  }

  /**
   * Processar mensagem recebida (apenas texto)
   * @param sessionId ID da sessão
   * @param data Dados da mensagem
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

        // Ignorar mensagens de grupos (se não configurado corretamente)
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

        console.log("📨 Mensagem salva:", {
          sessionId,
          fromPhone: message.key?.remoteJid?.replace("@s.whatsapp.net", ""),
          messageLength: messageText.length,
        });
      } catch (error) {
        console.error("❌ Erro ao salvar mensagem:", {
          sessionId,
          messageId: message.key?.id,
          error: error instanceof Error ? error.message : "Erro desconhecido",
        });
      }
    }
  }

  /**
   * Enviar mensagem de texto
   * @param tenantId ID do tenant
   * @param phoneNumber Número do telefone
   * @param text Texto da mensagem
   * @returns Resultado do envio
   */
  async sendMessage(
    tenantId: number,
    phoneNumber: string,
    text: string
  ): Promise<any> {
    try {
      console.log("📤 Iniciando envio de mensagem:", {
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

      // Formatar número de telefone
      const formattedNumber = phoneNumber.replace(/\D/g, "");

      const result = await evolutionService.sendTextMessage(
        session.sessionName,
        formattedNumber,
        text
      );

      console.log("✅ Mensagem enviada:", {
        tenantId,
        phoneNumber: formattedNumber,
        messageId: result?.key?.id,
      });

      return result;
    } catch (error: any) {
      console.error("❌ Erro ao enviar mensagem:", {
        tenantId,
        phoneNumber,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Obter QR Code manualmente
   * @param tenantId ID do tenant
   * @returns QR Code ou null
   */
  async getQRCodeManual(tenantId: number): Promise<string | null> {
    try {
      console.log("📱 Obtendo QR Code manual para tenant:", tenantId);

      const session = await prisma.whatsAppSession.findFirst({
        where: { tenantId },
      });

      if (!session) {
        throw new Error("Sessão não encontrada no banco de dados");
      }

      // Primeiro tentar obter do banco (se veio via webhook)
      if (session.qrCode) {
        console.log("✅ QR Code encontrado no banco:", tenantId);
        return session.qrCode;
      }

      // Se não tem no banco, tentar obter da Evolution API
      const qrCode = await evolutionService.getQRCode(session.sessionName);

      if (qrCode) {
        // Salvar no banco para próximas consultas
        await prisma.whatsAppSession.update({
          where: { id: session.id },
          data: { qrCode },
        });
        console.log(
          "✅ QR Code obtido da Evolution e salvo no banco:",
          tenantId
        );
      }

      return qrCode;
    } catch (error: any) {
      console.error("❌ Erro ao obter QR Code:", {
        tenantId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Obter configuração do webhook
   * @param tenantId ID do tenant
   * @returns Configuração do webhook
   */
  async getWebhookConfig(tenantId: number): Promise<any> {
    try {
      console.log("🔍 Obtendo configuração do webhook para tenant:", tenantId);

      const session = await prisma.whatsAppSession.findFirst({
        where: { tenantId },
      });

      if (!session) {
        throw new Error("Sessão não encontrada no banco de dados");
      }

      const webhookConfig = await evolutionService.getWebhookConfig(
        session.sessionName
      );

      return webhookConfig;
    } catch (error: any) {
      console.error("❌ Erro ao obter configuração do webhook:", {
        tenantId,
        error: error.message,
      });
      return null;
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

export const whatsappService = new WhatsAppService();
