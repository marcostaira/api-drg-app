import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { whatsappService } from "../services/whatsappService";
import { createAppError } from "../middlewares/errorHandler";

// Schemas de validação
const connectSchema = z.object({
  tenantId: z.coerce
    .number()
    .int()
    .positive("ID do tenant deve ser um número positivo"),
});

const disconnectSchema = z.object({
  tenantId: z.coerce
    .number()
    .int()
    .positive("ID do tenant deve ser um número positivo"),
});

const sendMessageSchema = z.object({
  tenantId: z.coerce
    .number()
    .int()
    .positive("ID do tenant deve ser um número positivo"),
  phoneNumber: z.string().min(10, "Número de telefone inválido"),
  text: z.string().min(1, "Texto da mensagem é obrigatório"),
});

const statusSchema = z.object({
  tenantId: z.coerce
    .number()
    .int()
    .positive("ID do tenant deve ser um número positivo"),
});

export class WhatsAppController {
  // Conectar tenant ao WhatsApp
  async connect(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { tenantId } = connectSchema.parse(req.body);

      const result = await whatsappService.connectTenant(tenantId);

      res.status(200).json({
        success: true,
        message: "Processo de conexão iniciado",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Desconectar sessão
  async disconnect(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { tenantId } = disconnectSchema.parse(req.body);

      await whatsappService.disconnectSession(tenantId);

      res.status(200).json({
        success: true,
        message: "Sessão desconectada com sucesso",
      });
    } catch (error) {
      next(error);
    }
  }

  // Obter status da sessão
  async getStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { tenantId } = statusSchema.parse(req.params);

      const status = await whatsappService.getSessionStatus(tenantId);

      res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error) {
      next(error);
    }
  }

  // Enviar mensagem de texto
  async sendMessage(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { tenantId, phoneNumber, text } = sendMessageSchema.parse(req.body);

      const result = await whatsappService.sendMessage(
        tenantId,
        phoneNumber,
        text
      );

      res.status(200).json({
        success: true,
        message: "Mensagem enviada com sucesso",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Webhook para receber dados do Evolution
  async webhook(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const webhookData = req.body;

      if (!tenantId || isNaN(tenantId)) {
        throw createAppError("ID do tenant deve ser um número válido", 400);
      }

      await whatsappService.processWebhook(tenantId, webhookData);

      res.status(200).json({
        success: true,
        message: "Webhook processado com sucesso",
      });
    } catch (error) {
      console.error("Erro no webhook:", error);
      next(error);
    }
  }
}

export const whatsappController = new WhatsAppController();
