import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { apiRoot, assertSafeProductionConfig, config } from "./config.js";
import { disconnectDatabase, prisma } from "./db.js";
import { ensurePostgres, verifyDatabaseConnection } from "./ensure-db.js";

async function main() {
  assertSafeProductionConfig();
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = config.databaseUrl;
  await ensurePostgres();
  await verifyDatabaseConnection();
  const { createApp } = await import("./app.js");
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    const seedPath = path.join(apiRoot, "prisma", "seed.ts");
    if (fs.existsSync(seedPath)) {
      const seed = await import("../prisma/seed.js");
      await seed.seedDatabase();
    }
  }
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`ChooseYourCreator API listening on port ${config.port}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, closing server and database connections...`);
    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
