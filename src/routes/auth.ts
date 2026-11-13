import { BRAND, normalizeIndianPhone, type Role } from "../shared/index.js";
import type { RequestHandler } from "express";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  clearSessionCookie,
  createSession,
  hashPassword,
  loadUser,
  publicUser,
  randomToken,
  requireUser,
  sha256,
  signOAuthState,
  verifyOAuthState,
  verifyPassword,
} from "../auth.js";
import { config, googleRedirectUri } from "../config.js";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { sendPhoneOtp } from "../otp.js";
import { exchangeSocialCode } from "../social-oauth.js";
import { randomInt } from "node:crypto";
import { sendEmail, signupOtpEmail, resetOtpEmail } from "../email.js";

export const authRouter = Router();

const noopMiddleware: RequestHandler = (_req, _res, next) => next();
const otpSendLimiter: RequestHandler =
  process.env.NODE_ENV === "test"
    ? noopMiddleware
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 8,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "Too many verification requests. Please try again later." },
      });

authRouter.get("/providers", (_req, res) => {
  res.json({
    google: Boolean(config.googleClientId && config.googleClientSecret),
    phone: true,
  });
});

const publicSignupRoleSchema = z.enum(["BRAND", "CREATOR"]);

function parsePublicSignupRole(value: unknown): "BRAND" | "CREATOR" | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = publicSignupRoleSchema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, "Role must be BRAND or CREATOR");
  }
  return parsed.data;
}

const registerSchema = z.object({
  email: z.string().email("Enter a valid email"),
  phone: z.string().min(10, "Enter a valid 10-digit phone number"),
  password: z.string().min(5, "Password must be at least 5 characters long."),
  role: publicSignupRoleSchema.optional(),
});

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const email = body.email.toLowerCase().trim();
    const normalizedPhone = normalizeIndianPhone(body.phone) ?? body.phone.trim();

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) throw new HttpError(409, "An account with this email already exists");

    const existingPhone = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
    if (existingPhone) throw new HttpError(409, "An account with this phone number already exists");

    const user = await prisma.user.create({
      data: {
        email,
        phone: normalizedPhone,
        passwordHash: await hashPassword(body.password),
        authProvider: "EMAIL",
        role: body.role,
      },
      include: { brandProfile: true, creatorProfile: true },
    });
    const token = await createSession(user.id, res);
    res.status(201).json({ user: publicUser(user), token });
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        email: z.string().email("Enter a valid email"),
        password: z.string().min(1, "Enter your password"),
      })
      .parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
      include: { brandProfile: true, creatorProfile: true },
    });
    if (!user?.passwordHash || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new HttpError(401, "Email or password is incorrect");
    }
    const token = await createSession(user.id, res);
    res.json({ user: publicUser(user), token });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    let token = req.cookies?.cyc_session as string | undefined;
    if (!token && req.headers.authorization) {
      token = req.headers.authorization.replace(/^Bearer\s+/i, "").trim();
    }
    if (token) {
      await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  }),
);

authRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    if (!user) throw new HttpError(401, "Sign in required");
    res.json({ user: publicUser(user) });
  }),
);

authRouter.post(
  "/role",
  requireUser,
  asyncHandler(async (req, res) => {
    const body = z.object({ role: z.enum(["BRAND", "CREATOR"]) }).parse(req.body);
    if (!req.user) throw new HttpError(401, "Sign in required");
    if (req.user.role && req.user.role !== body.role) {
      throw new HttpError(400, "Your role is already set");
    }
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { role: body.role as Role },
      include: { brandProfile: true, creatorProfile: true },
    });
    res.json({ user: publicUser(user) });
  }),
);

authRouter.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const body = z.object({ email: z.string().email() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    const payload: { ok: true; resetUrl?: string } = { ok: true };
    if (user) {
      const token = randomToken();
      await prisma.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      const resetUrl = `${config.clientOrigin}/reset-password?token=${token}`;
      if (!config.isProduction) payload.resetUrl = resetUrl;
    }
    res.json(payload);
  }),
);

authRouter.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        token: z.string().min(10),
        password: z.string().min(5, "Password must be at least 5 characters long."),
      })
      .parse(req.body);
    const reset = await prisma.passwordReset.findUnique({
      where: { tokenHash: sha256(body.token) },
    });
    if (!reset || reset.usedAt || reset.expiresAt.getTime() < Date.now()) {
      throw new HttpError(400, "This reset link is invalid or expired");
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash: await hashPassword(body.password) },
      }),
      prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      prisma.session.deleteMany({ where: { userId: reset.userId } }),
    ]);
    res.json({ ok: true });
  }),
);

authRouter.post(
  "/phone/send",
  otpSendLimiter,
  asyncHandler(async (req, res) => {
    const body = z.object({ phone: z.string().min(10, "Enter your phone number") }).parse(req.body);
    const result = await sendPhoneOtp(body.phone);
    res.json({ ok: true, ...(config.isProduction ? {} : result) });
  }),
);

authRouter.post(
  "/phone/verify",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        phone: z.string(),
        code: z.string().length(6, "Enter the 6-digit code"),
        role: z.enum(["BRAND", "CREATOR"]).optional(),
      })
      .parse(req.body);
    const phone = normalizeIndianPhone(body.phone);
    if (!phone) throw new HttpError(400, "Enter a valid Indian mobile number");
    const otp = await prisma.phoneOtp.findFirst({
      where: { phone },
      orderBy: { createdAt: "desc" },
    });
    if (!otp || otp.expiresAt.getTime() < Date.now()) {
      throw new HttpError(400, "That code has expired. Request a new one");
    }
    if (otp.attempts >= 5) throw new HttpError(429, "Too many attempts. Request a new code");
    if (otp.codeHash !== sha256(body.code)) {
      await prisma.phoneOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new HttpError(400, "That code is incorrect");
    }
    await prisma.phoneOtp.delete({ where: { id: otp.id } });
    let user = await prisma.user.findUnique({
      where: { phone },
      include: { brandProfile: true, creatorProfile: true },
    });
    if (!user) {
      user = await prisma.user.create({
        data: { phone, authProvider: "PHONE", role: body.role },
        include: { brandProfile: true, creatorProfile: true },
      });
    } else if (!user.role && body.role) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { role: body.role },
        include: { brandProfile: true, creatorProfile: true },
      });
    }
    const token = await createSession(user.id, res);
    res.json({ user: publicUser(user), token });
  }),
);

authRouter.get("/google", (req, res) => {
  if (!config.googleClientId || !config.googleClientSecret) {
    res.redirect(`${config.clientOrigin}/sign-in?error=${encodeURIComponent("Google sign-in is not configured on the server")}`);
    return;
  }
  const role = req.query.role === "BRAND" || req.query.role === "CREATOR" ? req.query.role : undefined;
  const rawToken = randomToken();
  const signedState = signOAuthState({ token: rawToken, role });

  res.cookie("cyc_oauth_state", `${rawToken}.${role ?? ""}`, {
    httpOnly: true,
    sameSite: config.isProduction ? "none" : "lax",
    secure: config.isProduction,
    path: "/",
    maxAge: 10 * 60 * 1000,
  });

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.googleClientId);
  url.searchParams.set("redirect_uri", googleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", signedState);
  url.searchParams.set("prompt", "select_account");
  res.redirect(url.toString());
});

authRouter.get(
  "/google/callback",
  asyncHandler(async (req, res) => {
    const errorParam = String(req.query.error ?? "");
    if (errorParam) {
      const desc = String(req.query.error_description || errorParam);
      res.redirect(`${config.clientOrigin}/sign-in?error=${encodeURIComponent(desc)}`);
      return;
    }

    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");

    const socialRaw = String(req.cookies?.cyc_social_state ?? "");
    if (socialRaw) {
      let stored: { state?: string; platform?: string; returnTo?: string; userId?: string } = {};
      try {
        stored = JSON.parse(socialRaw) as typeof stored;
      } catch {
        stored = {};
      }
      if (stored.platform === "YouTube" && stored.state && stored.state === state && stored.userId) {
        res.clearCookie("cyc_social_state", { path: "/" });
        const returnTo = stored.returnTo?.startsWith("/creator/") && !stored.returnTo.includes("?") ? stored.returnTo : "/creator/profile";
        const back = new URL(returnTo, config.clientOrigin);
        try {
          const connected = await exchangeSocialCode("YouTube", code);
          await prisma.socialAccount.upsert({
            where: { userId_platform: { userId: stored.userId, platform: "YouTube" } },
            update: {
              providerId: connected.providerId,
              username: connected.username,
              displayName: connected.displayName,
              profileUrl: connected.profileUrl,
              followers: connected.followers,
              accessToken: connected.accessToken,
              refreshToken: connected.refreshToken,
              expiresAt: connected.expiresAt,
            },
            create: {
              userId: stored.userId,
              platform: "YouTube",
              providerId: connected.providerId,
              username: connected.username,
              displayName: connected.displayName,
              profileUrl: connected.profileUrl,
              followers: connected.followers,
              accessToken: connected.accessToken,
              refreshToken: connected.refreshToken,
              expiresAt: connected.expiresAt,
            },
          });
          back.searchParams.set("connected", "YouTube");
        } catch (error) {
          back.searchParams.set("socialError", error instanceof Error ? error.message : "Could not connect YouTube");
        }
        res.redirect(back.toString());
        return;
      }
    }

    let role: "BRAND" | "CREATOR" | undefined;
    const verifiedPayload = verifyOAuthState(state);
    if (verifiedPayload) {
      role = verifiedPayload.role === "BRAND" || verifiedPayload.role === "CREATOR" ? verifiedPayload.role : undefined;
    } else {
      const cookie = String(req.cookies?.cyc_oauth_state ?? "");
      const [cookieState, roleRaw] = cookie.split(".");
      if (cookieState && (state === cookieState || state.startsWith(cookieState))) {
        role = roleRaw === "BRAND" || roleRaw === "CREATOR" ? roleRaw : undefined;
      }
    }

    res.clearCookie("cyc_oauth_state", { path: "/" });

    if (!code) {
      res.redirect(`${config.clientOrigin}/sign-in?error=${encodeURIComponent("Google authorization code was missing.")}`);
      return;
    }

    let tokens: { access_token?: string } = {};
    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: config.googleClientId,
          client_secret: config.googleClientSecret,
          redirect_uri: googleRedirectUri(),
          grant_type: "authorization_code",
        }),
      });
      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("Google token exchange error:", tokenResponse.status, errorText);
        res.redirect(`${config.clientOrigin}/sign-in?error=${encodeURIComponent("Google authentication failed during token verification.")}`);
        return;
      }
      tokens = (await tokenResponse.json()) as { access_token?: string };
    } catch (err) {
      console.error("Failed to connect to Google OAuth token endpoint:", err);
      res.redirect(`${config.clientOrigin}/sign-in?error=${encodeURIComponent("Could not reach Google authentication servers.")}`);
      return;
    }

    let profile: { id: string; email?: string } | null = null;
    try {
      const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token ?? ""}` },
      });
      if (!profileResponse.ok) {
        const errorText = await profileResponse.text();
        console.error("Google userinfo error:", profileResponse.status, errorText);
        res.redirect(`${config.clientOrigin}/sign-in?error=${encodeURIComponent("Failed to load Google profile details.")}`);
        return;
      }
      profile = (await profileResponse.json()) as { id: string; email?: string };
    } catch (err) {
      console.error("Failed to fetch Google profile:", err);
      res.redirect(`${config.clientOrigin}/sign-in?error=${encodeURIComponent("Could not retrieve Google profile.")}`);
      return;
    }

    if (!profile?.id) {
      res.redirect(`${config.clientOrigin}/sign-in?error=${encodeURIComponent("Google profile did not contain a valid ID.")}`);
      return;
    }

    const email = profile.email?.toLowerCase();
    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId: profile.id }, ...(email ? [{ email }] : [])] },
      include: { brandProfile: true, creatorProfile: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { email, googleId: profile.id, authProvider: "GOOGLE", role },
        include: { brandProfile: true, creatorProfile: true },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: profile.id,
          email: user.email ?? email,
          role: user.role ?? role,
        },
        include: { brandProfile: true, creatorProfile: true },
      });
    }

    const sessionToken = await createSession(user.id, res);
    const onboardingComplete = Boolean(
      (user.role === "BRAND" && user.brandProfile?.onboardingComplete) ||
      (user.role === "CREATOR" && user.creatorProfile?.onboardingComplete)
    );
    const next = !user.role
      ? "/get-started"
      : !onboardingComplete
        ? (user.role === "BRAND" ? "/brand/onboarding" : "/creator/onboarding")
        : (user.role === "BRAND" ? "/brand" : "/creator");
    res.redirect(`${config.clientOrigin}${next}?token=${sessionToken}`);
  }),
);

// ─── Email OTP helpers ────────────────────────────────────────────────────────

function generateOtp(): string {
  return String(randomInt(100000, 999999));
}

// POST /api/auth/email/send-verification  (signup OTP)
authRouter.post(
  "/email/send-verification",
  otpSendLimiter,
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const email = body.email.toLowerCase().trim();
    const normalizedPhone = normalizeIndianPhone(body.phone) ?? body.phone.trim();

    // Check if email already registered
    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) throw new HttpError(409, "An account with this email already exists");

    const existingPhone = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
    if (existingPhone) throw new HttpError(409, "An account with this phone number already exists");

    // Check resend cooldown (60s)
    const existing = await prisma.emailOtp.findFirst({
      where: { email, type: "SIGNUP" },
      orderBy: { sentAt: "desc" },
    });
    if (existing && Date.now() - existing.sentAt.getTime() < 60_000) {
      throw new HttpError(429, "Please wait before requesting another code");
    }

    // Delete old OTPs for this email+type
    await prisma.emailOtp.deleteMany({ where: { email, type: "SIGNUP" } });

    const otp = generateOtp();
    await prisma.emailOtp.create({
      data: {
        email,
        codeHash: sha256(otp),
        type: "SIGNUP",
        pendingData: {
          email,
          phone: normalizedPhone,
          password: body.password,
          role: body.role ?? null,
        } satisfies { email: string; phone: string; password: string; role: "BRAND" | "CREATOR" | null },
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    // Send email (don't block response on failure in dev)
    try {
      await sendEmail({ to: email, subject: `Verify your email – ${BRAND.name}`, html: signupOtpEmail(otp, email) });
    } catch (err) {
      console.error("Failed to send OTP email:", err);
      if (!config.isProduction) {
        // In dev, return the OTP so testing is possible
        res.json({ ok: true, email, devOtp: otp });
        return;
      }
      throw new HttpError(500, "Could not send verification email. Please try again.");
    }
    res.json({ ok: true, email });
  }),
);

// POST /api/auth/email/verify-signup
authRouter.post(
  "/email/verify-signup",
  asyncHandler(async (req, res) => {
    const body = z.object({ email: z.string().email(), code: z.string().length(6) }).parse(req.body);
    const email = body.email.toLowerCase().trim();

    const record = await prisma.emailOtp.findFirst({
      where: { email, type: "SIGNUP" },
      orderBy: { createdAt: "desc" },
    });
    if (!record || record.expiresAt.getTime() < Date.now()) {
      throw new HttpError(400, "This code has expired. Please request a new one");
    }
    if (record.attempts >= 5) {
      throw new HttpError(429, "Too many incorrect attempts. Request a new code");
    }
    if (record.codeHash !== sha256(body.code)) {
      await prisma.emailOtp.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
      const left = 5 - (record.attempts + 1);
      throw new HttpError(400, `Incorrect code. ${left > 0 ? `${left} attempt${left !== 1 ? "s" : ""} remaining` : "No attempts left – request a new code"}`);
    }

    // OTP valid – delete it
    await prisma.emailOtp.delete({ where: { id: record.id } });

    const pending = record.pendingData as { email: string; phone: string; password: string; role?: string | null };

    // Create user
    const existingEmail = await prisma.user.findUnique({ where: { email: pending.email } });
    if (existingEmail) throw new HttpError(409, "An account with this email already exists");

    const signupRole = parsePublicSignupRole(pending.role ?? undefined);

    const user = await prisma.user.create({
      data: {
        email: pending.email,
        phone: pending.phone,
        passwordHash: await hashPassword(pending.password),
        authProvider: "EMAIL",
        role: signupRole,
      },
      include: { brandProfile: true, creatorProfile: true },
    });
    const token = await createSession(user.id, res);
    res.status(201).json({ user: publicUser(user), token });
  }),
);

// POST /api/auth/email/resend-otp
authRouter.post(
  "/email/resend-otp",
  otpSendLimiter,
  asyncHandler(async (req, res) => {
    const body = z.object({ email: z.string().email(), type: z.enum(["SIGNUP", "RESET"]) }).parse(req.body);
    const email = body.email.toLowerCase().trim();

    const existing = await prisma.emailOtp.findFirst({
      where: { email, type: body.type },
      orderBy: { sentAt: "desc" },
    });
    if (existing && Date.now() - existing.sentAt.getTime() < 60_000) {
      throw new HttpError(429, "Please wait before requesting another code");
    }

    // For RESET, check user exists (don't reveal)
    const pendingData = existing?.pendingData ?? null;

    // Delete old
    await prisma.emailOtp.deleteMany({ where: { email, type: body.type } });

    const otp = generateOtp();
    await prisma.emailOtp.create({
      data: {
        email,
        codeHash: sha256(otp),
        type: body.type,
        pendingData: pendingData ?? undefined,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    const subject =
      body.type === "SIGNUP" ? `Verify your email – ${BRAND.name}` : `Reset your ${BRAND.name} password`;
    const html = body.type === "SIGNUP" ? signupOtpEmail(otp, email) : resetOtpEmail(otp, email);

    try {
      await sendEmail({ to: email, subject, html });
    } catch (err) {
      console.error("Resend OTP email error:", err);
      if (!config.isProduction) {
        res.json({ ok: true, devOtp: otp });
        return;
      }
      throw new HttpError(500, "Could not send email. Please try again.");
    }
    res.json({ ok: true });
  }),
);

// POST /api/auth/email/send-reset-otp  (forgot password)
authRouter.post(
  "/email/send-reset-otp",
  otpSendLimiter,
  asyncHandler(async (req, res) => {
    const body = z.object({ email: z.string().email() }).parse(req.body);
    const email = body.email.toLowerCase().trim();

    // Always return ok – don't reveal if email exists
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const existing = await prisma.emailOtp.findFirst({
        where: { email, type: "RESET" },
        orderBy: { sentAt: "desc" },
      });
      if (existing && Date.now() - existing.sentAt.getTime() < 60_000) {
        // Still return ok to prevent enumeration, but hint to wait
        res.json({ ok: true });
        return;
      }

      await prisma.emailOtp.deleteMany({ where: { email, type: "RESET" } });

      const otp = generateOtp();
      await prisma.emailOtp.create({
        data: {
          email,
          codeHash: sha256(otp),
          type: "RESET",
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });

      try {
        await sendEmail({ to: email, subject: `Reset your ${BRAND.name} password`, html: resetOtpEmail(otp, email) });
      } catch (err) {
        console.error("Reset OTP email error:", err);
        if (!config.isProduction) {
          res.json({ ok: true, devOtp: otp });
          return;
        }
      }
    }

    res.json({ ok: true });
  }),
);

// POST /api/auth/email/verify-reset-otp
authRouter.post(
  "/email/verify-reset-otp",
  asyncHandler(async (req, res) => {
    const body = z.object({ email: z.string().email(), code: z.string().length(6) }).parse(req.body);
    const email = body.email.toLowerCase().trim();

    const record = await prisma.emailOtp.findFirst({
      where: { email, type: "RESET" },
      orderBy: { createdAt: "desc" },
    });
    if (!record || record.expiresAt.getTime() < Date.now()) {
      throw new HttpError(400, "This code has expired. Please request a new one");
    }
    if (record.attempts >= 5) {
      throw new HttpError(429, "Too many incorrect attempts. Request a new code");
    }
    if (record.codeHash !== sha256(body.code)) {
      await prisma.emailOtp.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
      const left = 5 - (record.attempts + 1);
      throw new HttpError(400, `Incorrect code. ${left > 0 ? `${left} attempt${left !== 1 ? "s" : ""} remaining` : "No attempts left – request a new code"}`);
    }

    // Issue a short-lived reset token (not deleting OTP yet – will be deleted on password reset)
    const resetToken = randomToken();
    // Store the reset token in PasswordReset table linked to the user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Don't reveal
      res.json({ ok: true, resetToken });
      return;
    }

    await prisma.emailOtp.delete({ where: { id: record.id } });

    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: sha256(resetToken),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    res.json({ ok: true, resetToken });
  }),
);

// POST /api/auth/email/reset-password
authRouter.post(
  "/email/reset-password",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        resetToken: z.string().min(10),
        password: z.string().min(5, "Password must be at least 5 characters long."),
        confirmPassword: z.string(),
      })
      .refine((d) => d.password === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] })
      .parse(req.body);

    const reset = await prisma.passwordReset.findUnique({ where: { tokenHash: sha256(body.resetToken) } });
    if (!reset || reset.usedAt || reset.expiresAt.getTime() < Date.now()) {
      throw new HttpError(400, "This reset session is invalid or expired. Start the process again");
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash: await hashPassword(body.password) },
      }),
      prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      prisma.session.deleteMany({ where: { userId: reset.userId } }),
    ]);

    res.json({ ok: true });
  }),
);

// POST /api/auth/email/send-change-password-otp  (authenticated – change password from profile)
authRouter.post(
  "/email/send-change-password-otp",
  requireUser,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Sign in required");
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.email) throw new HttpError(400, "No email address is linked to your account");

    const email = user.email;

    // 60 s resend cooldown
    const existing = await prisma.emailOtp.findFirst({
      where: { email, type: "CHANGE_PW" },
      orderBy: { sentAt: "desc" },
    });
    if (existing && Date.now() - existing.sentAt.getTime() < 60_000) {
      throw new HttpError(429, "Please wait before requesting another code");
    }

    await prisma.emailOtp.deleteMany({ where: { email, type: "CHANGE_PW" } });

    const otp = generateOtp();
    await prisma.emailOtp.create({
      data: {
        email,
        codeHash: sha256(otp),
        type: "CHANGE_PW",
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    const html = signupOtpEmail(otp, email).replace(
      "Verify your email address",
      "Confirm your identity to change password",
    );

    try {
      await sendEmail({ to: email, subject: `Change password – ${BRAND.name}`, html });
    } catch (err) {
      console.error("Change-password OTP email error:", err);
      if (!config.isProduction) {
        res.json({ ok: true, email, devOtp: otp });
        return;
      }
      throw new HttpError(500, "Could not send verification email. Please try again.");
    }
    res.json({ ok: true, email });
  }),
);

// POST /api/auth/email/change-password  (authenticated – verify OTP then set new password)
authRouter.post(
  "/email/change-password",
  requireUser,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Sign in required");
    const body = z
      .object({
        code: z.string().length(6),
        password: z.string().min(5, "Password must be at least 5 characters long."),
        confirmPassword: z.string(),
      })
      .refine((d) => d.password === d.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.email) throw new HttpError(400, "No email address is linked to your account");

    const email = user.email;
    const record = await prisma.emailOtp.findFirst({
      where: { email, type: "CHANGE_PW" },
      orderBy: { createdAt: "desc" },
    });

    if (!record || record.expiresAt.getTime() < Date.now()) {
      throw new HttpError(400, "This code has expired. Please request a new one");
    }
    if (record.attempts >= 5) {
      throw new HttpError(429, "Too many incorrect attempts. Request a new code");
    }
    if (record.codeHash !== sha256(body.code)) {
      await prisma.emailOtp.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
      const left = 5 - (record.attempts + 1);
      throw new HttpError(
        400,
        `Incorrect code. ${left > 0 ? `${left} attempt${left !== 1 ? "s" : ""} remaining` : "No attempts left – request a new code"}`,
      );
    }

    // OTP valid – update password, invalidate all other sessions
    await prisma.emailOtp.delete({ where: { id: record.id } });
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(body.password) },
      }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);

    res.json({ ok: true });
  }),
);
