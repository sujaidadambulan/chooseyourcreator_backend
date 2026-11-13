import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { HttpError } from "./http.js";

export type AuthUser = Prisma.UserGetPayload<{
  include: { brandProfile: true; creatorProfile: true };
}>;

const userInclude = { brandProfile: true, creatorProfile: true } as const;

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(): string {
  return randomBytes(32).toString("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signOAuthState(payload: { token: string; role?: string; returnTo?: string }): string {
  const data = Buffer.from(JSON.stringify({ ...payload, ts: Date.now() })).toString("base64url");
  const signature = createHash("sha256").update(`${data}:${config.jwtSecret}`).digest("base64url");
  return `${data}.${signature}`;
}

export function verifyOAuthState(stateStr: string): { token: string; role?: string; returnTo?: string } | null {
  try {
    const [data, signature] = stateStr.split(".");
    if (!data || !signature) return null;
    const expected = createHash("sha256").update(`${data}:${config.jwtSecret}`).digest("base64url");
    if (signature !== expected) return null;
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as { token: string; role?: string; returnTo?: string; ts: number };
    if (Date.now() - payload.ts > 15 * 60 * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}


export function setSessionCookie(res: Response, token: string) {
  const isProduction = config.isProduction;
  res.cookie("cyc_session", token, {
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
    path: "/",
    maxAge: 14 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  const isProduction = config.isProduction;
  res.clearCookie("cyc_session", {
    path: "/",
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
  });
}

export async function createSession(userId: string, res: Response): Promise<string> {
  const token = randomToken();
  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
  setSessionCookie(res, token);
  return token;
}

export async function loadUser(req: Request): Promise<AuthUser | null> {
  let token = req.cookies?.cyc_session as string | undefined;
  if (!token && req.headers.authorization) {
    token = req.headers.authorization.replace(/^Bearer\s+/i, "").trim();
  }
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: userInclude } },
  });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  return session.user;
}

export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = await loadUser(req);
    if (!user) throw new HttpError(401, "Sign in required");
    if ((user as { isBlocked?: boolean }).isBlocked) {
      throw new HttpError(403, "Your account has been suspended by an administrator.");
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(role: "BRAND" | "CREATOR" | "ADMIN") {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new HttpError(401, "Sign in required"));
      return;
    }
    if (req.user.role !== role) {
      next(new HttpError(403, "You do not have access to this area"));
      return;
    }
    next();
  };
}

export function publicUser(user: AuthUser) {
  const onboardingComplete = user.role === "BRAND"
    ? Boolean(user.brandProfile?.onboardingComplete)
    : user.role === "CREATOR"
      ? Boolean(user.creatorProfile?.onboardingComplete)
      : user.role === "ADMIN"
        ? true
        : false;
  return {
    id: user.id,
    email: user.email,
    // Phone number is strictly private: never sent to public clients, only visible in Admin side
    phone: user.role === "ADMIN" ? user.phone : null,
    role: user.role,
    onboardingComplete,
    profileName: user.brandProfile?.companyName ?? user.creatorProfile?.name ?? (user.role === "ADMIN" ? "Admin" : null),
    profileImage: user.brandProfile?.companyLogo ?? user.creatorProfile?.profileImage ?? null,
  };
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function otpCode(): string {
  return randomInt(0, 1000000).toString().padStart(6, "0");
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
