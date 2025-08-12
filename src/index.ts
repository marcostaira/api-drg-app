// src/index.ts
// Arquivo principal da aplicação com inicialização melhorada e queue processor

import "dotenv/config";
import { app } from "./app";
import { config } from "./config/config";
import { testDatabaseConnection, disconnectDatabase } from "./config/database";
import { queueProcessor } from "./jobs/queueProcessor";
import { logger } from "./utils/logger";

/**
 * Inicializar servidor com verificações
 */
async function startServer() {
  try {
    console.log("🚀 Iniciando WhatsApp API...");
    console.log(`📊 Ambiente: ${config.nodeEnv}`);
    console.log(`🔗 Porta: ${config.port}`);

    // Testar conexão com banco de dados
    const dbConnected = await testDatabaseConnection();
    if (!dbConnected) {
      console.error("❌ Falha na conexão com banco de dados");
      process.exit(1);
    }

    // Iniciar processador de fila em produção
    if (config.nodeEnv === "production") {
      try {
        queueProcessor.start(5); // Processar a cada 5 minutos
        console.log("📬 Queue processor iniciado (intervalo: 5 min)");
      } catch (error) {
        console.error("⚠️ Erro ao iniciar queue processor:", error);
        // Não falhar a aplicação se o queue processor falhar
        logger.error("Queue processor falhou ao iniciar", error);
      }
    } else {
      console.log("📬 Queue processor desativado (modo desenvolvimento)");
      console.log("   Use POST /api/queue/process para processar manualmente");
    }

    // Iniciar servidor
    const server = app.listen(config.port, () => {
      console.log(`✅ Servidor rodando na porta ${config.port}`);
      console.log(`🏥 Health check: http://localhost:${config.port}/health`);
      console.log(
        `📱 WhatsApp API: http://localhost:${config.port}/api/whatsapp`
      );
      console.log(`📬 Queue API: http://localhost:${config.port}/api/queue`);
      console.log(
        `🎣 Webhook URL: http://localhost:${config.port}/api/webhook`
      );
      console.log(`📚 Documentação: http://localhost:${config.port}/api`);

      if (config.nodeEnv === "development") {
        console.log("🔧 Modo desenvolvimento ativo");
        console.log(
          "💡 Dica: Use o endpoint /api/queue/process para testar o envio"
        );
      }
    });

    // Configurar timeout do servidor
    server.timeout = 30000; // 30 segundos

    return server;
  } catch (error) {
    console.error("❌ Falha ao iniciar servidor:", error);
    process.exit(1);
  }
}

/**
 * Função para parada graciosa do servidor
 */
async function gracefulShutdown(signal: string) {
  console.log(`\n⏳ Recebido sinal ${signal}, iniciando parada graciosa...`);

  try {
    // Parar processador de fila se estiver rodando
    if (config.nodeEnv === "production") {
      console.log("📬 Parando queue processor...");
      queueProcessor.stop();
    }

    // Desconectar do banco de dados
    await disconnectDatabase();

    console.log("✅ Aplicação finalizada graciosamente");
    process.exit(0);
  } catch (error) {
    console.error("❌ Erro durante parada graciosa:", error);
    process.exit(1);
  }
}

// Listeners para parada graciosa
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Listener para erros não capturados
process.on("uncaughtException", (error) => {
  console.error("❌ Exceção não capturada:", error);

  // Tentar parar o queue processor antes de sair
  try {
    queueProcessor.stop();
  } catch (e) {
    // Ignorar erros ao parar o queue processor
  }

  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Promise rejeitada não tratada:", reason);
  console.error("Promise:", promise);

  // Tentar parar o queue processor antes de sair
  try {
    queueProcessor.stop();
  } catch (e) {
    // Ignorar erros ao parar o queue processor
  }

  process.exit(1);
});

// Iniciar aplicação
startServer().catch((error) => {
  console.error("❌ Erro fatal na inicialização:", error);
  process.exit(1);
});
