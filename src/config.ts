import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND } from "./shared/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export const apiRoot = path.resolve(here, "..");

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
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  emailFrom: process.env.EMAIL_FROM ?? BRAND.adminEmail,
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
