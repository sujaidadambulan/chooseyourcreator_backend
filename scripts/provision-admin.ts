import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/auth.js";

const prisma = new PrismaClient();

function usage(): never {
  console.error("Usage: npm run provision-admin -- --email <address>");
  console.error("Password is read from stdin (not echoed) or set ADMIN_PROVISION_PASSWORD for non-interactive use.");
  process.exit(1);
}

function readFlag(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return undefined;
  return process.argv[idx + 1];
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env.ADMIN_PROVISION_PASSWORD;
  if (fromEnv && fromEnv.length >= 5) {
    return fromEnv;
  }
  const rl = createInterface({ input, output });
  try {
    const password = await rl.question("Admin password (min 5 characters): ");
    if (password.length < 5) {
      console.error("Password must be at least 5 characters.");
      process.exit(1);
    }
    const confirm = await rl.question("Confirm password: ");
    if (password !== confirm) {
      console.error("Passwords do not match.");
      process.exit(1);
    }
    return password;
  } finally {
    rl.close();
  }
}

async function main() {
  const emailRaw = readFlag("--email");
  if (!emailRaw) usage();
  const email = emailRaw.toLowerCase().trim();
  if (!email.includes("@")) {
    console.error("Enter a valid email address.");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role === "ADMIN") {
      console.error("An admin account with this email already exists. No changes were made.");
      process.exit(1);
    }
    console.error("A user with this email already exists. Refusing to overwrite or change their role.");
    process.exit(1);
  }

  const password = await readPassword();
  const passwordHash = await hashPassword(password);

  await prisma.user.create({
    data: {
      email,
      passwordHash,
      authProvider: "EMAIL",
      role: "ADMIN",
    },
  });

  console.log("Admin account created successfully.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Provisioning failed.");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
