import { prisma } from "../config/database";
import { evolutionService } from "./evolutionService";
import { config } from "../config/config";
import { WhatsAppSessionStatus } from "@prisma/client";

export class WhatsAppService {
  // Conectar tenant ao WhatsApp
  async connectTenant(tenantId: number): Promise<any> {
    // Verificar se o tenant existe
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new Error("Tenant não encontrado");
    }

    // Verificar se já existe uma sessão ativa
    let session = await prisma.whatsAppSession.findFirst({
      where: {
        tenantId: tenantId,
        status: { in: ["CONNECTING", "CONNECTED"] },
      },
    });

    // Nome da sessão será o ID do tenant
    const sessionName = `tenant_${tenantId}`;
    const webhookUrl = `${config.webhookBaseUrl}/api/webhook/whatsapp/${tenantId}`;

    if (!session) {
      // Verificar se a sessão existe no Evolution
      const sessionExists = await evolutionService.checkSession(sessionName);

      if (!sessionExists) {
        // Criar nova sessão no Evolution
        await evolutionService.createSession(sessionName, webhookUrl);

        // Aguardar um pouco para a sessão ser criada
        await this.delay(2000);

        // Configurar sessão (não aceitar grupos, não sincronizar histórico)
        await evolutionService.configureSession(sessionName);

        // Configurar webhook
        await evolutionService.configureWebhook(sessionName, webhookUrl);
      }

      // Criar ou atualizar sessão no banco
      session = await prisma.whatsAppSession.upsert({
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
    }

    // Obter QR Code
    const qrCode = await evolutionService.getQRCode(sessionName);

    if (qrCode) {
      await prisma.whatsAppSession.update({
        where: { id: session.id },
        data: { qrCode },
      });
    }

    return {
      sessionId: session.id,
      sessionName,
      status: session.status,
      qrCode,
      webhookUrl,
    };
  }

  // Desconectar sessão
  async disconnectSession(tenantId: number): Promise<void> {
    const session = await prisma.whatsAppSession.findFirst({
      where: { tenantId },
    });

    if (!session) {
      throw new Error("Sessão não encontrada");
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
  }

  // Obter status da sessão
  async getSessionStatus(tenantId: number): Promise<any> {
    const session = await prisma.whatsAppSession.findFirst({
      where: { tenantId },
    });

    if (!session) {
      return {
        connected: false,
        status: "DISCONNECTED",
        message: "Sessão não encontrada",
      };
    }

    try {
      // Obter status do Evolution
      const evolutionStatus = await evolutionService.getSessionStatus(
        session.sessionName
      );
      const sessionInfo = await evolutionService.getSessionInfo(
        session.sessionName
      );

      return {
        connected: session.status === "CONNECTED",
        status: session.status,
        phoneNumber: session.phoneNumber,
        profileName: session.profileName,
        sessionName: session.sessionName,
        connectedAt: session.connectedAt,
        evolutionStatus: evolutionStatus?.state,
        sessionInfo,
      };
    } catch (error) {
      console.error("Erro ao obter status da sessão:", error);
      return {
        connected: false,
        status: session.status,
        phoneNumber: session.phoneNumber,
        profileName: session.profileName,
        error: "Erro ao conectar com Evolution API",
      };
    }
  }

  // Processar webhook do Evolution
  async processWebhook(tenantId: number, webhookData: any): Promise<void> {
    const { event, data } = webhookData;

    const session = await prisma.whatsAppSession.findFirst({
      where: { tenantId },
    });

    if (!session) {
      console.log("Sessão não encontrada para webhook:", tenantId);
      return;
    }

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
        console.log("Evento não tratado:", event);
    }
  }

  // Processar atualização de QR Code
  private async handleQRCodeUpdate(
    sessionId: string,
    data: any
  ): Promise<void> {
    if (data.qrCode) {
      await prisma.whatsAppSession.update({
        where: { id: sessionId },
        data: { qrCode: data.qrCode },
      });
    }
  }

  // Processar atualização de conexão
  private async handleConnectionUpdate(
    sessionId: string,
    data: any
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
        break;
      case "connecting":
        status = "CONNECTING";
        break;
      case "close":
        status = "DISCONNECTED";
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

  // Processar mensagem recebida (apenas texto)
  private async handleMessageReceived(
    sessionId: string,
    data: any
  ): Promise<void> {
    const messages = data.messages || [data];

    for (const message of messages) {
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

      try {
        await prisma.receivedMessage.create({
          data: {
            whatsappSessionId: sessionId,
            messageId: message.key?.id || `${Date.now()}`,
            fromPhone:
              message.key?.remoteJid?.replace("@s.whatsapp.net", "") || "",
            fromName: message.pushName || null,
            messageText:
              message.message?.conversation ||
              message.message?.extendedTextMessage?.text ||
              "",
            messageType: "text",
            timestamp: new Date(message.messageTimestamp * 1000),
          },
        });
      } catch (error) {
        console.error("Erro ao salvar mensagem:", error);
      }
    }
  }

  // Enviar mensagem de texto
  async sendMessage(
    tenantId: number,
    phoneNumber: string,
    text: string
  ): Promise<any> {
    const session = await prisma.whatsAppSession.findFirst({
      where: {
        tenantId,
        status: "CONNECTED",
      },
    });

    if (!session) {
      throw new Error("Sessão não conectada");
    }

    // Formatar número de telefone
    const formattedNumber = phoneNumber.replace(/\D/g, "");

    return await evolutionService.sendTextMessage(
      session.sessionName,
      formattedNumber,
      text
    );
  }

  // Utility para delay
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const whatsappService = new WhatsAppService();
