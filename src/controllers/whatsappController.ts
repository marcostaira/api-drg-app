// src/controllers/whatsappController.ts
// Controller WhatsApp corrigido - sem API Key no body

import { Request, Response, NextFunction } from "express";
import { whatsappService } from "../services/whatsappService";
import { createAppError } from "../middlewares/errorHandler";
import { logger } from "../utils/logger";
import {
  connectSchema,
  disconnectSchema,
  evolutionWebhookSchema,
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
   * Conectar tenant ao WhatsApp - SEM API KEY NO BODY
   * POST /api/whatsapp/connect
   */
  async connect(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      logger.info("Controller: Iniciando conexão", {
        body: req.body,
        ip: req.ip,
      });

      const { tenantId }: ConnectRequest = connectSchema.parse(req.body);

      // Chama serviço SEM API Key (usa do .env)
      const result = await whatsappService.connectTenant(tenantId);

      logger.info("Controller: Conexão processada", {
        tenantId,
        sessionId: result.sessionId,
        status: result.status,
      });

      res.status(200).json({
        success: true,
        message: "Processo de conexão iniciado com sucesso",
        data: {
          ...result,
          // Remover API Key da resposta por segurança
          evolutionApiKey: undefined,
        },
      });
    } catch (error) {
      logger.error("Controller: Erro na conexão", error, {
        body: req.body,
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
   * Obter token da sessão
   * GET /api/whatsapp/token/:tenantId
   */
  async getSessionToken(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      logger.debug("Controller: Obtendo token da sessão", {
        params: req.params,
        ip: req.ip,
      });

      const { tenantId }: StatusRequest = statusSchema.parse(req.params);

      // CHAMA O SERVICE
      const sessionToken = await whatsappService.getSessionToken(tenantId);

      if (!sessionToken) {
        res.status(404).json({
          success: false,
          message: "Token não encontrado para esta sessão",
          data: { tenantId },
        });
        return;
      }

      logger.info("Controller: Token obtido", {
        tenantId,
        hasToken: !!sessionToken,
      });

      res.status(200).json({
        success: true,
        message: "Token obtido com sucesso",
        data: {
          tenantId,
          sessionToken,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("Controller: Erro ao obter token", error, {
        params: req.params,
      });
      next(error);
    }
  }

  /**
   * Webhook para receber dados do Evolution - CORRIGIDO
   */
  async webhook(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const tenantIdParam = req.params.tenantId;
      const tenantId = parseInt(tenantIdParam);

      // Log detalhado do payload recebido
      logger.info("🎣 Webhook Evolution API recebido", {
        tenantId,
        event: req.body?.event,
        instance: req.body?.instance,
        messageType: req.body?.data?.messageType,
        hasMessage: !!req.body?.data?.message,
        fullPayload: JSON.stringify(req.body, null, 2),
      });

      // Validar tenantId
      if (!tenantId || isNaN(tenantId) || tenantId <= 0) {
        throw createAppError(
          "ID do tenant deve ser um número válido e positivo",
          400
        );
      }

      // Validar dados do webhook - USANDO SCHEMA CORRETO
      const webhookData = evolutionWebhookSchema.parse(req.body);

      // Extrair o nome da instância para validar
      const expectedInstanceName = `tenant_${tenantId}`;
      if (webhookData.instance !== expectedInstanceName) {
        logger.warn("Nome da instância não confere", {
          expected: expectedInstanceName,
          received: webhookData.instance,
          tenantId,
        });
      }

      // Processar webhook
      await whatsappService.processEvolutionWebhook(tenantId, webhookData);

      logger.info("Controller: Webhook Evolution processado", {
        tenantId,
        event: webhookData.event,
        instance: webhookData.instance,
      });

      res.status(200).json({
        success: true,
        message: "Webhook processado com sucesso",
        data: {
          tenantId,
          event: webhookData.event,
          instance: webhookData.instance,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("Controller: Erro no webhook Evolution", error, {
        tenantId: req.params.tenantId,
        event: req.body?.event,
        body: req.body,
      });
      next(error);
    }
  }
}

export const whatsappController = new WhatsAppController();
