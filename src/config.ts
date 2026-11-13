import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND } from "./shared/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Backend package root (contains prisma/, uploads/). Works from src/ (dev) and dist/src/ (production). */
function resolveApiRoot(): string {
  for (const candidate of [path.resolve(here, ".."), path.resolve(here, "../.."), path.resolve(here, "../../..")]) {
    if (fs.existsSync(path.join(candidate, "prisma", "schema.prisma"))) {
      return candidate;
    }
  }
  return path.resolve(here, "..");
}

export const apiRoot = resolveApiRoot();

const rawClientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
export const allowedOrigins = rawClientOrigin
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const DEV_JWT_FALLBACK = "dev-secret-change-me-in-production";

/** Fail fast when production is misconfigured (secrets, CORS). */
export function assertSafeProductionConfig(): void {
  if (process.env.NODE_ENV !== "production") return;

  const jwt = process.env.JWT_SECRET?.trim() ?? "";
  if (!jwt) {
    throw new Error("JWT_SECRET is required when NODE_ENV=production");
  }
  if (jwt === DEV_JWT_FALLBACK) {
    throw new Error("JWT_SECRET must not use the default development value in production");
  }

  if (allowedOrigins.length === 0) {
    throw new Error("CLIENT_ORIGIN must list at least one frontend URL in production");
  }
  if (allowedOrigins.some((o) => o === "*")) {
    throw new Error("CLIENT_ORIGIN must not use wildcards in production");
  }

  if (process.env.PAYMENTS_LIVE === "true") {
    if (!process.env.RAZORPAY_KEY_ID?.trim() || !process.env.RAZORPAY_KEY_SECRET?.trim()) {
      throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required when PAYMENTS_LIVE=true");
    }
    if (!process.env.RAZORPAY_WEBHOOK_SECRET?.trim()) {
      throw new Error("RAZORPAY_WEBHOOK_SECRET is required when PAYMENTS_LIVE=true");
    }
  }

  const googleId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  if (googleId || googleSecret) {
    if (!googleId || !googleSecret) {
      throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set in production");
    }
    if (googleId.startsWith("http://") || googleId.startsWith("https://")) {
      throw new Error(
        "GOOGLE_CLIENT_ID looks like a URL. Use the Client ID from Google Cloud Console " +
          "(ends with .apps.googleusercontent.com), not the redirect URI.",
      );
    }
    if (
      !googleId.includes(".apps.googleusercontent.com") &&
      !/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(googleId)
    ) {
      throw new Error(
        "GOOGLE_CLIENT_ID must be the OAuth Client ID from Google Cloud Console (….apps.googleusercontent.com).",
      );
    }
    if (googleSecret.startsWith("http://") || googleSecret.startsWith("https://")) {
      throw new Error(
        "GOOGLE_CLIENT_SECRET looks like a URL. Paste the Client secret from Google Cloud Console, not the callback URL.",
      );
    }
  }

  const apiOrigin = (process.env.API_ORIGIN ?? "").replace(/\/+$/, "");
  if (!apiOrigin) {
    throw new Error("API_ORIGIN is required in production (e.g. https://api.chooseyourcreator.in)");
  }

  if (!process.env.SMTP_USER?.trim() || !process.env.SMTP_PASS?.trim()) {
    console.warn(
      "SMTP_USER / SMTP_PASS are not set — email signup and password-reset codes will not send. " +
        "Configure Gmail app password or another SMTP provider on Render.",
    );
  }
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  clientOrigin: allowedOrigins[0] ?? "http://localhost:5173",
  allowedOrigins,
  apiOrigin: (process.env.API_ORIGIN ?? process.env.SERVER_ORIGIN ?? "").replace(/\/+$/, ""),
  databaseUrl:
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5433/drcollab",
  paymentsLive: process.env.PAYMENTS_LIVE === "true",
  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  instagramClientId: process.env.INSTAGRAM_CLIENT_ID ?? "",
  instagramClientSecret: process.env.INSTAGRAM_CLIENT_SECRET ?? "",
  youtubeClientId: process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "",
  youtubeClientSecret: process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "",
  tiktokClientKey: process.env.TIKTOK_CLIENT_KEY ?? "",
  tiktokClientSecret: process.env.TIKTOK_CLIENT_SECRET ?? "",
  msg91AuthKey: process.env.MSG91_AUTH_KEY ?? "",
  msg91TemplateId: process.env.MSG91_TEMPLATE_ID ?? "",
  jwtSecret: process.env.JWT_SECRET ?? DEV_JWT_FALLBACK,
  isProduction: process.env.NODE_ENV === "production",
  uploadsDir: path.join(apiRoot, "uploads"),
  pgPort: 5433,
  pgUser: "postgres",
  pgPassword: "postgres",
  pgDatabase: "drcollab",
  smtpHost: process.env.SMTP_HOST ?? "smtp.gmail.com",
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpSecure: process.env.SMTP_SECURE === "true" || Number(process.env.SMTP_PORT ?? 587) === 465,
  smtpUser: process.env.SMTP_USER?.trim() ?? "",
  smtpPass: (process.env.SMTP_PASS ?? "").replace(/\s+/g, ""),
  emailFrom: (process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? BRAND.adminEmail).trim(),
  emailFromName: process.env.EMAIL_FROM_NAME ?? BRAND.name,
};

export function googleRedirectUri(): string {
  // Allow an explicit override (useful for production deployments or custom setups)
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  // Use backend API origin for OAuth callbacks (defaults to API_ORIGIN or http://localhost:4000)
  const base = config.apiOrigin || config.clientOrigin;
  return `${base}/api/auth/google/callback`;
}

export function socialRedirectUri(platform: "instagram" | "youtube"): string {
  const base = config.apiOrigin || config.clientOrigin;
  return `${base}/api/creator/social/${platform}/callback`;
}
