// src/repositories/waTemplateRepository.ts
// Repository para gerenciar templates WhatsApp - COM LOGS DETALHADOS

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
   * Busca template por tipo - COM LOGS DETALHADOS
   */
  async getByType(
    ownerId: number | string,
    type: string
  ): Promise<TemplateData | null> {
    try {
      logger.info("🔍 TEMPLATE REPO - Buscando template", {
        ownerId,
        type,
        ownerIdType: typeof ownerId,
      });

      const templates = await prisma.$queryRaw<any[]>`
        SELECT id, owner_id, type, content, active
        FROM wa_templates
        WHERE owner_id = ${Number(ownerId)}
        AND type = ${type}
        AND active = 1
        ORDER BY created_at DESC
        LIMIT 1
      `;

      logger.info("📋 TEMPLATE REPO - Resultado da query", {
        ownerId,
        type,
        foundTemplates: templates.length,
        templates: templates.map((t) => ({
          id: t.id,
          type: t.type,
          content: t.content.substring(0, 50) + "...",
        })),
      });

      if (templates.length === 0) {
        logger.warn("⚠️ TEMPLATE REPO - Template não encontrado", {
          ownerId,
          type,
        });

        // Buscar todos os templates para debug
        const allTemplates = await prisma.$queryRaw<any[]>`
          SELECT id, owner_id, type, content, active
          FROM wa_templates
          WHERE owner_id = ${Number(ownerId)}
          ORDER BY type
        `;

        logger.info("📋 TEMPLATE REPO - Todos os templates do owner", {
          ownerId,
          allTemplates: allTemplates.map((t) => ({
            id: t.id,
            type: t.type,
            active: t.active,
            content: t.content.substring(0, 30) + "...",
          })),
        });

        return null;
      }

      const template = templates[0];

      logger.info("✅ TEMPLATE REPO - Template encontrado", {
        templateId: template.id,
        templateType: template.type,
        searchedType: type,
        typesMatch: template.type === type,
        content: template.content.substring(0, 100) + "...",
      });

      return template;
    } catch (error) {
      logger.error("❌ TEMPLATE REPO - Erro ao buscar template", error, {
        ownerId,
        type,
      });
      return null;
    }
  }

  /**
   * NOVO: Buscar todos os templates de um owner
   */
  async getAllByOwner(ownerId: number | string): Promise<TemplateData[]> {
    try {
      const templates = await prisma.$queryRaw<any[]>`
        SELECT id, owner_id, type, content, active
        FROM wa_templates
        WHERE owner_id = ${Number(ownerId)}
        ORDER BY type, created_at DESC
      `;

      logger.info("📋 TEMPLATE REPO - Todos os templates", {
        ownerId,
        count: templates.length,
        templates: templates.map((t) => ({
          id: t.id,
          type: t.type,
          active: t.active,
        })),
      });

      return templates;
    } catch (error) {
      logger.error(
        "❌ TEMPLATE REPO - Erro ao buscar todos os templates",
        error,
        {
          ownerId,
        }
      );
      return [];
    }
  }
}

export const waTemplateRepository = new WaTemplateRepository();
