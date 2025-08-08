import "dotenv/config";
import { app } from "./app";
import { config } from "./config/config";
import { prisma } from "./config/database";

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log("✅ Database connected successfully");

    // Start server
    app.listen(config.port, () => {
      console.log(`🚀 Server running on port ${config.port}`);
      console.log(`📊 Environment: ${config.nodeEnv}`);
      console.log(`🔗 Health check: http://localhost:${config.port}/health`);
      console.log(
        `📱 WhatsApp API: http://localhost:${config.port}/api/whatsapp`
      );
      console.log(
        `🎣 Webhook URL: http://localhost:${config.port}/api/webhook`
      );
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n⏳ Shutting down gracefully...");
  await prisma.$disconnect();
  console.log("✅ Database disconnected");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n⏳ Shutting down gracefully...");
  await prisma.$disconnect();
  console.log("✅ Database disconnected");
  process.exit(0);
});

startServer();
