import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { allowedOrigins, config } from "./config.js";
import { errorHandler } from "./http.js";
import { agreementRouter } from "./routes/agreements.js";
import { applicationRouter, campaignRouter, invitationRouter, workRouter } from "./routes/campaigns.js";
import { authRouter } from "./routes/auth.js";
import { discoveryRouter } from "./routes/discovery.js";
import { fileRouter } from "./routes/files.js";
import { messageRouter } from "./routes/messages.js";
import { paymentRouter, paymentWebhook } from "./routes/payments.js";
import { performancePaymentRouter } from "./routes/performance-payments.js";
import { brandRouter, creatorRouter } from "./routes/profiles.js";
import { submissionRouter } from "./routes/submissions.js";
import { notificationRouter } from "./routes/notifications.js";
import { adminRouter } from "./routes/admin.js";
import { collaborationRouter } from "./routes/collaborations.js";
import { contactRouter } from "./routes/contact.js";

export function createApp() {
  const app = express();
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        // Non-browser clients (health checks, webhooks, server-side) often omit Origin.
        if (!origin) return callback(null, true);

        const normalized = origin.replace(/\/+$/, "");
        if (allowedOrigins.includes("*")) return callback(null, true);
        if (allowedOrigins.includes(normalized)) return callback(null, true);

        if (!config.isProduction && (normalized.includes("localhost") || normalized.includes("127.0.0.1"))) {
          return callback(null, true);
        }

        callback(null, false);
      },
      credentials: true,
    }),
  );
  app.post("/api/payments/webhook", express.raw({ type: "application/json" }), paymentWebhook);
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  if (process.env.NODE_ENV !== "test") {
    app.use(
      "/api/auth",
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 60,
        standardHeaders: true,
        legacyHeaders: false,
      }),
    );
    app.use(
      "/api/contact",
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "Too many contact requests. Please try again later." },
      }),
    );
  }
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/auth", authRouter);
  app.use("/api/brand", brandRouter);
  app.use("/api/creator", creatorRouter);
  app.use("/api/creator", workRouter);
  app.use("/api", discoveryRouter);
  app.use("/api/campaigns", campaignRouter);
  app.use("/api/collaborations", collaborationRouter);
  app.use("/api", applicationRouter);
  app.use("/api/invitations", invitationRouter);
  app.use("/api/conversations", messageRouter);
  app.use("/api/agreements", agreementRouter);
  app.use("/api/payments", paymentRouter);
  app.use("/api/performance-payments", performancePaymentRouter);
  app.use("/api/submissions", submissionRouter);
  app.use("/api/notifications", notificationRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/contact", contactRouter);
  app.use("/api/files", fileRouter);
  app.use(errorHandler);
  return app;
}
