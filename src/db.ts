import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/** Cloud Run / container graceful shutdown: release DB connections. */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
