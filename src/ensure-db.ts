import { execSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import EmbeddedPostgres from "embedded-postgres";
import { PrismaClient } from "@prisma/client";
import { apiRoot, config } from "./config.js";

const dataDir = path.join(os.homedir(), ".drcollab", "pgdata");

let starting: Promise<void> | null = null;

function isLocalEmbeddedDb(url: string): boolean {
  return url.includes("127.0.0.1:5433") || url.includes("localhost:5433");
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

async function canReachDatabase(databaseUrl: string): Promise<boolean> {
  const probeMs = process.env.NODE_ENV === "production" ? 20_000 : 4_000;
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await Promise.race([
      client.$queryRaw`SELECT 1`,
      delay(probeMs).then(() => {
        throw new Error("database probe timeout");
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}

/** Dev-only: free a stuck listener on the embedded Postgres port (Windows). */
function releaseLocalPort(port: number) {
  if (process.platform !== "win32") return;
  try {
    const out = execSync(
      `powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess"`,
      { encoding: "utf8" },
    ).trim();
    const pid = Number(out);
    if (Number.isFinite(pid) && pid > 0) {
      execSync(`taskkill /F /PID ${pid}`, { stdio: "pipe" });
      console.warn(`Stopped process ${pid} on port ${port} (database was not responding).`);
    }
  } catch {
    // Port may already be free.
  }
}

function waitForPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const socket = net.connect({ port, host: "127.0.0.1" }, () => {
        socket.end();
        resolve(true);
      });
      socket.on("error", () => {
        if (Date.now() - started > 30000) resolve(false);
        else setTimeout(tick, 300);
      });
    };
    tick();
  });
}

/** Stop embedded Postgres workers still bound to our data directory (Windows). */
function killPostgresForDataDir(dir: string) {
  if (process.platform !== "win32") return;
  const fragment = dir.replace(/'/g, "''");
  try {
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'postgres.exe'\\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*${fragment}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
      { stdio: "pipe" },
    );
  } catch {
    // No matching processes.
  }
}

function clearStalePgLock() {
  killPostgresForDataDir(dataDir);
  const lock = path.join(dataDir, "postmaster.pid");
  if (!fs.existsSync(lock)) return;
  const pid = Number(fs.readFileSync(lock, "utf8").split(/\s+/)[0]);
  let running = false;
  if (Number.isFinite(pid) && pid > 0) {
    try {
      process.kill(pid, 0);
      running = true;
    } catch {
      running = false;
    }
  }
  if (!running) {
    fs.unlinkSync(lock);
    console.warn("Removed stale PostgreSQL lock (postmaster.pid).");
    return;
  }
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: "pipe" });
      fs.unlinkSync(lock);
      console.warn(`Stopped stuck PostgreSQL process ${pid} and cleared lock file.`);
    } catch {
      // Another handler may already be stopping it.
    }
  }
}

async function startEmbeddedPostgres(): Promise<void> {
  fs.mkdirSync(dataDir, { recursive: true });
  clearStalePgLock();
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: config.pgUser,
    password: config.pgPassword,
    port: config.pgPort,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });
  const marker = path.join(dataDir, "PG_VERSION");
  if (!fs.existsSync(marker)) {
    await pg.initialise();
  }
  let startError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await pg.start();
      startError = undefined;
      break;
    } catch (error) {
      startError = error;
      killPostgresForDataDir(dataDir);
      clearStalePgLock();
      await delay(1000);
    }
  }
  if (startError) throw startError;
  try {
    await pg.createDatabase(config.pgDatabase);
  } catch {
    // Database already exists.
  }
  try {
    await pg.createDatabase("drcollab_test");
  } catch {
    // Test database already exists.
  }
}

export async function ensurePostgres(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? config.databaseUrl;
  if (!isLocalEmbeddedDb(databaseUrl)) {
    return;
  }

  if (await canReachDatabase(databaseUrl)) {
    return;
  }

  if (await portOpen(config.pgPort)) {
    console.warn(
      `Port ${config.pgPort} is in use but PostgreSQL is not accepting connections. Trying to restart it...`,
    );
    killPostgresForDataDir(dataDir);
    releaseLocalPort(config.pgPort);
    clearStalePgLock();
    await delay(800);
  }

  if (!starting) {
    starting = (async () => {
      await startEmbeddedPostgres();
    })().finally(() => {
      starting = null;
    });
  }
  await starting;

  const ready = await waitForPort(config.pgPort);
  if (!ready) {
    throw new Error(`PostgreSQL did not start on port ${config.pgPort}. Check ${dataDir}`);
  }

  if (!(await canReachDatabase(databaseUrl))) {
    throw new Error(
      `PostgreSQL is running on port ${config.pgPort} but the app cannot connect. ` +
        `Verify DATABASE_URL in backend/.env matches user postgres / database drcollab.`,
    );
  }
}

/** Apply pending SQL migrations in production (Supabase session pooler via DIRECT_DATABASE_URL). */
export function applyProductionMigrations(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.SKIP_PRISMA_MIGRATE === "1") return;

  console.log("Applying database migrations (prisma migrate deploy)…");
  try {
    const schemaPath = path.join(apiRoot, "prisma", "schema.prisma");
    execSync(`npx prisma migrate deploy --schema "${schemaPath}"`, {
      cwd: apiRoot,
      stdio: "inherit",
      env: process.env,
      timeout: 180_000,
    });
  } catch (error) {
    const hint =
      "Ensure DIRECT_DATABASE_URL is the Supabase Session pooler (port 5432 on *.pooler.supabase.com), " +
      "not db.*.supabase.co. DATABASE_URL should be the Transaction pooler (port 6543) with ?pgbouncer=true.";
    throw new Error(
      `prisma migrate deploy failed. ${hint} ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Fail fast at startup if the database is unreachable (no schema changes). */
export async function verifyDatabaseConnection(databaseUrl = process.env.DATABASE_URL ?? config.databaseUrl): Promise<void> {
  if (!(await canReachDatabase(databaseUrl))) {
    throw new Error(
      "Cannot connect to PostgreSQL. Check DATABASE_URL and that migrations have been applied (prisma migrate deploy).",
    );
  }
}

/**
 * Dev/test only — never run from production server startup.
 * Allowed when DATABASE_URL targets local embedded Postgres (127.0.0.1:5433 / localhost:5433)
 * or when ALLOW_DB_PUSH=true is explicitly set (e.g. local experiments).
 */
export async function pushSchema(databaseUrl = config.databaseUrl, acceptDataLoss = false): Promise<void> {
  const localEmbedded = isLocalEmbeddedDb(databaseUrl);
  if (!localEmbedded && process.env.ALLOW_DB_PUSH !== "true") {
    throw new Error(
      "Refusing prisma db push: target is not local embedded Postgres. Use prisma migrate deploy for production.",
    );
  }

  const args = ["prisma", "db", "push", "--skip-generate"];
  if (acceptDataLoss) args.push("--accept-data-loss");

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      execSync(`npx ${args.join(" ")}`, {
        cwd: apiRoot,
        stdio: "pipe",
        env: { ...process.env, DATABASE_URL: databaseUrl },
        timeout: 120_000,
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await delay(1500 * attempt);
    }
  }
  throw new Error(
    `prisma db push failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
