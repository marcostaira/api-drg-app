// src/controllers/whatsappController.ts
// Controller WhatsApp com validações melhoradas

import { Request, Response, NextFunction } from "express";
import { whatsappService } from "../services/whatsappService";
import { createAppError } from "../middlewares/errorHandler";
import {
  connectSchema,
  disconnectSchema,
  sendMessageSchema,
  statusSchema,
  webhookDataSchema,
  type ConnectRequest,
  type DisconnectRequest,
  type SendMessageRequest,
  type StatusRequest,
} from "../schemas/whatsappSchemas";

export class WhatsAppController {
  /**
   * Conectar tenant ao WhatsApp
   * POST /api/whatsapp/connect
   */
  async connect(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      console.log("🚀 Controller: Iniciando conexão", {
        body: req.body,
        ip: req.ip,
      });

      const { tenantId }: ConnectRequest = connectSchema.parse(req.body);

      const result = await whatsappService.connectTenant(tenantId);

      console.log("✅ Controller: Conexão processada", {
        tenantId,
        sessionId: result.sessionId,
        status: result.status,
      });

      res.status(200).json({
        success: true,
        message: "Processo de conexão iniciado com sucesso",
        data: result,
      });
    } catch (error) {
      console.error("❌ Controller: Erro na conexão", {
        body: req.body,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
      next(error);
    }
  }

  /**
   * Desconectar sessão
   * POST /api/whatsapp/disconnect
   */
  async disconnect(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      console.log("🔌 Controller: Iniciando desconexão", {
        body: req.body,
        ip: req.ip,
      });

      const { tenantId }: DisconnectRequest = disconnectSchema.parse(req.body);

      await whatsappService.disconnectSession(tenantId);

      console.log("✅ Controller: Desconexão processada", { tenantId });

      res.status(200).json({
        success: true,
        message: "Sessão desconectada com sucesso",
        data: { tenantId },
      });
    } catch (error) {
      console.error("❌ Controller: Erro na desconexão", {
        body: req.body,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
      next(error);
    }
  }

  /**
   * Obter status da sessão
   * GET /api/whatsapp/status/:tenantId
   */
  async getStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      console.log("📊 Controller: Obtendo status", {
        params: req.params,
        ip: req.ip,
      });

      const { tenantId }: StatusRequest = statusSchema.parse(req.params);

      const status = await whatsappService.getSessionStatus(tenantId);

      console.log("✅ Controller: Status obtido", {
        tenantId,
        connected: status.connected,
        status: status.status,
      });

      res.status(200).json({
        success: true,
        message: "Status obtido com sucesso",
        data: status,
      });
    } catch (error) {
      console.error("❌ Controller: Erro ao obter status", {
        params: req.params,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
      next(error);
    }
  }

  /**
   * Enviar mensagem de texto
   * POST /api/whatsapp/send-message
   */
  async sendMessage(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      console.log("📤 Controller: Enviando mensagem", {
        body: { ...req.body, text: `[${req.body?.text?.length || 0} chars]` },
        ip: req.ip,
      });

      const { tenantId, phoneNumber, text }: SendMessageRequest =
        sendMessageSchema.parse(req.body);

      const result = await whatsappService.sendMessage(
        tenantId,
        phoneNumber,
        text
      );

      console.log("✅ Controller: Mensagem enviada", {
        tenantId,
        phoneNumber,
        messageId: result?.key?.id,
      });

      res.status(200).json({
        success: true,
        message: "Mensagem enviada com sucesso",
        data: {
          tenantId,
          phoneNumber,
          messageId: result?.key?.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("❌ Controller: Erro ao enviar mensagem", {
        body: { ...req.body, text: `[${req.body?.text?.length || 0} chars]` },
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
      next(error);
    }
  }

  /**
   * Webhook para receber dados do Evolution
   * POST /api/webhook/whatsapp/:tenantId
   */
  async webhook(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const tenantIdParam = req.params.tenantId;
      const tenantId = parseInt(tenantIdParam);

      console.log("🎣 Controller: Webhook recebido", {
        tenantId: tenantIdParam,
        event: req.body?.event,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });

      // Validar tenantId
      if (!tenantId || isNaN(tenantId) || tenantId <= 0) {
        throw createAppError(
          "ID do tenant deve ser um número válido e positivo",
          400
        );
      }

      // Validar dados do webhook
      const webhookData = webhookDataSchema.parse(req.body);

      await whatsappService.processWebhook(tenantId, webhookData);

      console.log("✅ Controller: Webhook processado", {
        tenantId,
        event: webhookData.event,
      });

      res.status(200).json({
        success: true,
        message: "Webhook processado com sucesso",
        data: {
          tenantId,
          event: webhookData.event,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("❌ Controller: Erro no webhook", {
        tenantId: req.params.tenantId,
        event: req.body?.event,
        error: error instanceof Error ? error.message : "Erro desconhecido",
        body: req.body,
      });
      next(error);
    }
  }

  /**
   * Obter QR Code da sessão
   * GET /api/whatsapp/qrcode/:tenantId
   */
  async getQRCode(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      console.log("📱 Controller: Obtendo QR Code", {
        params: req.params,
        ip: req.ip,
      });

      const { tenantId }: StatusRequest = statusSchema.parse(req.params);

      const qrCode = await whatsappService.getQRCodeManual(tenantId);

      console.log("✅ Controller: QR Code obtido", {
        tenantId,
        hasQrCode: !!qrCode,
      });

      if (!qrCode) {
        res.status(404).json({
          success: false,
          message:
            "QR Code não disponível. Verifique se a sessão está conectando.",
          data: { tenantId },
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "QR Code obtido com sucesso",
        data: {
          tenantId,
          qrCode,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("❌ Controller: Erro ao obter QR Code", {
        params: req.params,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
      next(error);
    }
  }

  /**
   * Verificar configuração do webhook
   * GET /api/whatsapp/webhook/:tenantId
   */
  async getWebhook(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      console.log("🎣 Controller: Verificando webhook", {
        params: req.params,
        ip: req.ip,
      });

      const { tenantId }: StatusRequest = statusSchema.parse(req.params);

      const webhookConfig = await whatsappService.getWebhookConfig(tenantId);

      console.log("✅ Controller: Webhook verificado", {
        tenantId,
        hasWebhook: !!webhookConfig,
      });

      res.status(200).json({
        success: true,
        message: "Configuração do webhook obtida",
        data: {
          tenantId,
          webhook: webhookConfig,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("❌ Controller: Erro ao verificar webhook", {
        params: req.params,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
      next(error);
    }
  }

  /**
   * Health check específico do WhatsApp
   * GET /api/whatsapp/health
   */
  async health(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      console.log("💊 Controller: Health check WhatsApp", { ip: req.ip });

      // Verificar se pode conectar com Evolution API (teste básico)
      // Aqui você poderia fazer uma verificação simples do Evolution

      res.status(200).json({
        success: true,
        message: "WhatsApp API está funcionando",
        data: {
          status: "healthy",
          timestamp: new Date().toISOString(),
          version: "1.0.0",
        },
      });
    } catch (error) {
      console.error("❌ Controller: Erro no health check", {
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
      next(error);
    }
  }
}

export const whatsappController = new WhatsAppController();
