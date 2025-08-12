// src/config/database.ts
// Configuração do banco de dados com funções de teste e desconexão

import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Testa a conexão com o banco de dados
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$connect();
    
    // Fazer uma query simples para verificar se realmente está conectado
    await prisma.$queryRaw`SELECT 1`;
    
    console.log("✅ Conexão com banco de dados estabelecida");
    return true;
  } catch (error) {
    console.error("❌ Erro ao conectar com banco de dados:", error);
    logger.error("Falha na conexão com banco de dados", error);
    return false;
  }
}

/**
 * Desconecta do banco de dados
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    console.log("✅ Desconectado do banco de dados");
  } catch (error) {
    console.error("⚠️ Erro ao desconectar do banco de dados:", error);
    logger.error("Erro ao desconectar do banco", error);
  }
}

/**
 * Verifica se o banco está conectado
 */
export async function isDatabaseConnected(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}