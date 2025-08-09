// src/index.ts
// Arquivo principal da aplicação com inicialização melhorada

import "dotenv/config";
import { app } from "./app";
import { config } from "./config/config";
import { testDatabaseConnection, disconnectDatabase } from "./config/database";

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

    // Iniciar servidor
    const server = app.listen(config.port, () => {
      console.log(`✅ Servidor rodando na porta ${config.port}`);
      console.log(`🏥 Health check: http://localhost:${config.port}/health`);
      console.log(
        `📱 WhatsApp API: http://localhost:${config.port}/api/whatsapp`
      );
      console.log(
        `🎣 Webhook URL: http://localhost:${config.port}/api/webhook`
      );
      console.log(`📚 Documentação: http://localhost:${config.port}/api`);

      if (config.nodeEnv === "development") {
        console.log("🔧 Modo desenvolvimento ativo");
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
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Promise rejeitada não tratada:", reason);
  console.error("Promise:", promise);
  process.exit(1);
});

// Iniciar aplicação
startServer().catch((error) => {
  console.error("❌ Erro fatal na inicialização:", error);
  process.exit(1);
});
