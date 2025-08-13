// src/controllers/whatsappController.ts
// Controller WhatsApp com validações melhoradas e suporte a API Key

import { Request, Response, NextFunction } from "express";
import { whatsappService } from "../services/whatsappService";
import { createAppError } from "../middlewares/errorHandler";
import { logger } from "../utils/logger";
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
import { prisma } from "@/config/database";

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
      logger.info("Controller: Iniciando conexão", {
        body: {
          ...req.body,
          evolutionApiKey: req.body.evolutionApiKey ? "[REDACTED]" : undefined,
        },
        ip: req.ip,
      });

      const { tenantId, evolutionApiKey }: ConnectRequest = connectSchema.parse(
        req.body
      );

      const result = await whatsappService.connectTenant(
        tenantId,
        evolutionApiKey
      );

      logger.info("Controller: Conexão processada", {
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
      logger.error("Controller: Erro na conexão", error, {
        body: { ...req.body, evolutionApiKey: "[REDACTED]" },
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
      logger.info("Controller: Iniciando desconexão", {
        body: req.body,
        ip: req.ip,
      });

      const { tenantId }: DisconnectRequest = disconnectSchema.parse(req.body);

      await whatsappService.disconnectSession(tenantId);

      logger.info("Controller: Desconexão processada", { tenantId });

      res.status(200).json({
        success: true,
        message: "Sessão desconectada com sucesso",
        data: { tenantId },
      });
    } catch (error) {
      logger.error("Controller: Erro na desconexão", error, {
        body: req.body,
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
      logger.debug("Controller: Obtendo status", {
        params: req.params,
        ip: req.ip,
      });

      const { tenantId }: StatusRequest = statusSchema.parse(req.params);

      const status = await whatsappService.getSessionStatus(tenantId);

      logger.info("Controller: Status obtido", {
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
      logger.error("Controller: Erro ao obter status", error, {
        params: req.params,
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
      logger.info("Controller: Enviando mensagem", {
        body: { ...req.body, text: `[${req.body?.text?.length || 0} chars]` },
        ip: req.ip,
      });

      const { tenantId, phoneNumber, text, options }: SendMessageRequest =
        sendMessageSchema.parse(req.body);

      const result = await whatsappService.sendMessage(
        tenantId,
        phoneNumber,
        text,
        options
      );

      logger.info("Controller: Mensagem enviada", {
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
      logger.error("Controller: Erro ao enviar mensagem", error, {
        body: { ...req.body, text: `[${req.body?.text?.length || 0} chars]` },
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

      logger.webhook(req.body?.event || "unknown", {
        tenantId,
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

      logger.info("Controller: Webhook processado", {
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
      logger.error("Controller: Erro no webhook", error, {
        tenantId: req.params.tenantId,
        event: req.body?.event,
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
      logger.debug("Controller: Obtendo QR Code", {
        params: req.params,
        ip: req.ip,
      });

      const { tenantId }: StatusRequest = statusSchema.parse(req.params);

      const qrCode = await whatsappService.getQRCodeManual(tenantId);

      logger.info("Controller: QR Code obtido", {
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
      logger.error("Controller: Erro ao obter QR Code", error, {
        params: req.params,
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
      logger.debug("Controller: Verificando webhook", {
        params: req.params,
        ip: req.ip,
      });

      const { tenantId }: StatusRequest = statusSchema.parse(req.params);

      const webhookConfig = await whatsappService.getWebhookConfig(tenantId);

      logger.info("Controller: Webhook verificado", {
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
      logger.error("Controller: Erro ao verificar webhook", error, {
        params: req.params,
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
      logger.debug("Controller: Health check WhatsApp", { ip: req.ip });

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
      logger.error("Controller: Erro no health check", error);
      next(error);
    }
  }

  /**
   * Atualizar API Key da sessão
   * PUT /api/whatsapp/api-key
   */
  async updateApiKey(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      logger.info("Controller: Atualizando API Key", {
        body: { ...req.body, evolutionApiKey: "[REDACTED]" },
        ip: req.ip,
      });

      const { tenantId, evolutionApiKey } = req.body;

      if (!tenantId || !evolutionApiKey) {
        throw createAppError(
          "TenantId e evolutionApiKey são obrigatórios",
          400
        );
      }

      // Atualizar API Key na sessão existente
      const session = await prisma.whatsAppSession.findFirst({
        where: { tenantId },
      });

      if (!session) {
        throw createAppError("Sessão não encontrada para este tenant", 404);
      }

      await prisma.whatsAppSession.update({
        where: { id: session.id },
        data: { evolutionApiKey },
      });

      logger.info("Controller: API Key atualizada", { tenantId });

      res.status(200).json({
        success: true,
        message: "API Key atualizada com sucesso",
        data: { tenantId },
      });
    } catch (error) {
      logger.error("Controller: Erro ao atualizar API Key", error, {
        body: { ...req.body, evolutionApiKey: "[REDACTED]" },
      });
      next(error);
    }
  }
}

export const whatsappController = new WhatsAppController();
