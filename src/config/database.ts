// src/config/database.ts
// Configuração do Prisma Client com melhor gerenciamento

import { PrismaClient } from "@prisma/client";

// Extensão do globalThis para incluir o Prisma
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Configuração do Prisma Client
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "info", "warn", "error"]
        : ["error"],
    errorFormat: "pretty",
  });

// Em desenvolvimento, reutilizar a instância global para evitar muitas conexões
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Função para testar a conexão com o banco
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$connect();
    console.log("✅ Conexão com banco de dados estabelecida");
    return true;
  } catch (error) {
    console.error("❌ Erro ao conectar com banco de dados:", error);
    return false;
  }
}

// Função para desconectar do banco graciosamente
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    console.log("✅ Desconectado do banco de dados");
  } catch (error) {
    console.error("❌ Erro ao desconectar do banco de dados:", error);
  }
}
