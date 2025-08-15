// src/repositories/waTemplateRepository.ts
// Repository para gerenciar templates WhatsApp

import { prisma } from "../config/database";
import { logger } from "../utils/logger";

export interface TemplateData {
  id: number;
  owner_id: number;
  type: string;
  content: string;
  active: boolean;
}

export class WaTemplateRepository {
  /**
   * Busca template por tipo
   */
  async getByType(
    ownerId: number | string,
    type: string
  ): Promise<TemplateData | null> {
    try {
      const templates = await prisma.$queryRaw<any[]>`
        SELECT id, owner_id, type, content, active
        FROM wa_templates
        WHERE owner_id = ${Number(ownerId)}
        AND type = ${type}
        AND active = 1
        LIMIT 1
      `;

      if (templates.length === 0) {
        logger.debug("Template não encontrado", { ownerId, type });
        return null;
      }

      return templates[0];
    } catch (error) {
      logger.error("Erro ao buscar template", error, { ownerId, type });
      return null;
    }
  }
}

export const waTemplateRepository = new WaTemplateRepository();
