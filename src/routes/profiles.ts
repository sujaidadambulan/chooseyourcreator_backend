import {
  BRAND_ROLES,
  EMPLOYEE_SIZES,
  FOLLOWER_ESTIMATES,
  NICHES,
  PLATFORMS,
  normalizeGpayUpi,
} from "../shared/index.js";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { randomToken, requireRole, requireUser } from "../auth.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { writeUpload } from "../files.js";
import { asyncHandler, HttpError } from "../http.js";
import {
  authorizationUrl,
  connectablePlatform,
  exchangeSocialCode,
  socialConfigured,
  type Connectable,
} from "../social-oauth.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const socialSchema = z
  .object({
    instagram: z.string().optional(),
    youtube: z.string().optional(),
    facebook: z.string().optional(),
    other: z.string().optional(),
  })
  .partial();

const brandSchema = z.object({
  companyName: z.string().trim().min(2, "Please enter your company name."),
  websiteUrl: z.string().trim().optional().or(z.literal("")),
  niche: z.enum(NICHES, { errorMap: () => ({ message: "Please select your business niche." }) }),
  employeeSize: z.enum(EMPLOYEE_SIZES),
  role: z.enum(BRAND_ROLES),
  businessDescription: z.string().trim().min(10, "Add a short description"),
  socialLinks: socialSchema.optional(),
}).superRefine((body, context) => {
  if (body.websiteUrl && body.websiteUrl.trim() !== "") {
    try {
      const u = new URL(body.websiteUrl.trim());
      if (!["http:", "https:"].includes(u.protocol)) {
        context.addIssue({ code: "custom", message: "Enter a valid website URL or leave this field empty." });
      }
    } catch {
      context.addIssue({ code: "custom", message: "Enter a valid website URL or leave this field empty." });
    }
  }

  const links = body.socialLinks ?? {};
  const supported = ["Instagram", "YouTube", "Facebook"] as const;
  let hasValidLink = false;
  let hasAnyInput = false;

  for (const p of supported) {
    const key = p.toLowerCase() as "instagram" | "youtube" | "facebook";
    const val = links[key]?.trim();
    if (val) {
      hasAnyInput = true;
      if (!isPlatformUrl(p, val)) {
        context.addIssue({ code: "custom", message: `Enter a valid ${p} profile URL` });
      } else {
        hasValidLink = true;
      }
    }
  }
  if (!hasAnyInput) {
    context.addIssue({ code: "custom", message: "Add at least one social media profile link." });
  } else if (!hasValidLink) {
    context.addIssue({ code: "custom", message: "Enter a valid social media profile URL." });
  }
});

const creatorSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name."),
  bio: z.string().trim().min(10, "Please write a short bio."),
  city: z.string().trim().min(2, "Please enter your city."),
  niche: z.enum(NICHES, { errorMap: () => ({ message: "Please select a niche." }) }),
  gpayUpi: z.string().trim().min(3, "Enter your GPay or UPI number for payouts."),
  socialPlatforms: z.array(z.enum(PLATFORMS)).min(1, "Add at least one social media profile link."),
  socialLinks: socialSchema.optional(),
  followerCounts: z.record(z.string(), z.number().int().nonnegative()).optional(),
  followerRanges: z
    .record(
      z.string(),
      z.enum([
        "under-5k",
        "5k-10k",
        "10k-25k",
        "25k-50k",
        "50k-100k",
        "above-100k",
        // Legacy range IDs for backward compatibility
        "0-10k",
        "10k-50k",
        "100k+",
      ]),
    )
    .optional(),
}).superRefine((body, context) => {
  if (!normalizeGpayUpi(body.gpayUpi)) {
    context.addIssue({
      code: "custom",
      message: "Enter a valid UPI ID (e.g. name@okaxis) or 10-digit mobile number.",
      path: ["gpayUpi"],
    });
  }
  let hasValidSocial = false;
  for (const platform of body.socialPlatforms) {
    if (platform === "Other") continue;
    const key = platform.toLowerCase() as "instagram" | "youtube" | "facebook";
    const link = body.socialLinks?.[key]?.trim();
    if (!link) context.addIssue({ code: "custom", message: `Add your ${platform} profile URL` });
    else if (!isPlatformUrl(platform, link)) context.addIssue({ code: "custom", message: `Enter a valid ${platform} profile URL` });
    else hasValidSocial = true;
    const hasRange = Boolean(body.followerRanges?.[platform] || body.followerRanges?.[key]);
    const hasCount = (body.followerCounts?.[platform] != null) || (body.followerCounts?.[key] != null);
    if (!hasRange && !hasCount) {
      context.addIssue({ code: "custom", message: `Choose a follower estimate for ${platform}` });
    }
  }
  if (!hasValidSocial && body.socialPlatforms.filter((p) => p !== "Other").length === 0) {
    context.addIssue({ code: "custom", message: "Add at least one social media profile link." });
  }
});

function isPlatformUrl(platform: string, value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (platform === "Instagram") return host === "instagram.com";
  if (platform === "YouTube") return host === "youtube.com" || host === "youtu.be";
  if (platform === "Facebook") return host === "facebook.com" || host === "fb.com" || host === "m.facebook.com";
  return true;
}

export const brandRouter = Router();
export const creatorRouter = Router();

brandRouter.use(requireUser, requireRole("BRAND"));
creatorRouter.use(requireUser, requireRole("CREATOR"));

brandRouter.get(
  "/profile",
  asyncHandler(async (req, res) => {
    res.json({ profile: req.user?.brandProfile ?? null });
  }),
);

brandRouter.put(
  "/profile",
  asyncHandler(async (req, res) => {
    const body = brandSchema.parse(req.body);
    const userId = req.user!.id;
    const profile = await prisma.brandProfile.upsert({
      where: { userId },
      update: { ...body, socialLinks: body.socialLinks ?? {}, onboardingComplete: true },
      create: { userId, ...body, socialLinks: body.socialLinks ?? {}, onboardingComplete: true },
    });
    res.json({ profile });
  }),
);

brandRouter.post(
  "/logo",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Choose an image");
    if (!["image/jpeg", "image/png", "image/webp"].includes(req.file.mimetype)) {
      throw new HttpError(400, "Use a JPG, PNG, or WebP image");
    }
    const profile = req.user?.brandProfile;
    if (!profile) throw new HttpError(400, "Complete your profile first");
    const ext = req.file.mimetype === "image/png" ? "png" : req.file.mimetype === "image/webp" ? "webp" : "jpg";
    const key = `profiles/${req.user!.id}/logo.${ext}`;
    await writeUpload(key, req.file.buffer);
    const updated = await prisma.brandProfile.update({
      where: { id: profile.id },
      data: { companyLogo: key },
    });
    res.json({ profile: updated });
  }),
);

brandRouter.post(
  "/banner",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Choose an image");
    if (!["image/jpeg", "image/png", "image/webp"].includes(req.file.mimetype)) {
      throw new HttpError(400, "Use a JPG, PNG, or WebP image");
    }
    const profile = req.user?.brandProfile;
    if (!profile) throw new HttpError(400, "Complete your profile first");
    const ext = req.file.mimetype === "image/png" ? "png" : req.file.mimetype === "image/webp" ? "webp" : "jpg";
    const key = `profiles/${req.user!.id}/banner.${ext}`;
    await writeUpload(key, req.file.buffer);
    const updated = await prisma.brandProfile.update({
      where: { id: profile.id },
      data: { bannerImage: key },
    });
    res.json({ profile: updated });
  }),
);

const SOCIAL_STATE_COOKIE = "cyc_social_state";

function safeReturn(value: unknown): string {
  const path = typeof value === "string" ? value : "/creator/profile";
  if (!path.startsWith("/creator/") || path.startsWith("//") || path.includes("\\") || path.includes("?")) {
    return "/creator/profile";
  }
  return path;
}

function redirectWith(res: { redirect: (url: string) => void }, returnTo: string, params: Record<string, string>) {
  const url = new URL(returnTo, config.clientOrigin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  res.redirect(url.toString());
}

function publicAccount(account: { platform: string; username: string; displayName: string; profileUrl: string; followers: number }) {
  return {
    platform: account.platform,
    username: account.username,
    displayName: account.displayName,
    profileUrl: account.profileUrl,
    followers: account.followers,
  };
}

creatorRouter.get(
  "/social",
  asyncHandler(async (req, res) => {
    const accounts = await prisma.socialAccount.findMany({
      where: { userId: req.user!.id },
      orderBy: { platform: "asc" },
    });
    res.json({ accounts: accounts.map(publicAccount) });
  }),
);

creatorRouter.delete(
  "/social/:platform",
  asyncHandler(async (req, res) => {
    const platform = connectablePlatform(String(req.params.platform));
    await prisma.socialAccount.deleteMany({ where: { userId: req.user!.id, platform } });
    res.json({ ok: true });
  }),
);

creatorRouter.get("/social/:platform/connect", (req, res, next) => {
  try {
    const platform = connectablePlatform(String(req.params.platform));
    const returnTo = safeReturn(req.query.returnTo);
    if (!socialConfigured(platform)) {
      redirectWith(res, returnTo, { socialError: `${platform} connect is not configured` });
      return;
    }
    const state = randomToken();
    res.cookie(SOCIAL_STATE_COOKIE, JSON.stringify({ state, platform, returnTo, userId: req.user!.id }), {
      httpOnly: true,
      sameSite: config.isProduction ? "none" : "lax",
      secure: config.isProduction,
      path: "/",
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(authorizationUrl(platform, state));
  } catch (error) {
    next(error);
  }
});

creatorRouter.get(
  "/social/:platform/callback",
  asyncHandler(async (req, res) => {
    const platform = connectablePlatform(String(req.params.platform));
    const code = String(req.query.code ?? "").replace(/#_$/, "");
    const state = String(req.query.state ?? "");
    let stored: { state?: string; platform?: Connectable; returnTo?: string } = {};
    try {
      stored = JSON.parse(String(req.cookies?.[SOCIAL_STATE_COOKIE] ?? "{}")) as typeof stored;
    } catch {
      stored = {};
    }
    const returnTo = safeReturn(stored.returnTo);
    res.clearCookie(SOCIAL_STATE_COOKIE, { path: "/" });
    const providerError = String(req.query.error_description ?? req.query.error ?? "");
    if (providerError) {
      redirectWith(res, returnTo, { socialError: providerError });
      return;
    }
    if (!code || !state || state !== stored.state || stored.platform !== platform) {
      redirectWith(res, returnTo, { socialError: `${platform} authorization could not be verified` });
      return;
    }
    try {
      const profile = await exchangeSocialCode(platform, code);
      await prisma.socialAccount.upsert({
        where: { userId_platform: { userId: req.user!.id, platform } },
        update: {
          providerId: profile.providerId,
          username: profile.username,
          displayName: profile.displayName,
          profileUrl: profile.profileUrl,
          followers: profile.followers,
          accessToken: profile.accessToken,
          refreshToken: profile.refreshToken,
          expiresAt: profile.expiresAt,
        },
        create: {
          userId: req.user!.id,
          platform,
          providerId: profile.providerId,
          username: profile.username,
          displayName: profile.displayName,
          profileUrl: profile.profileUrl,
          followers: profile.followers,
          accessToken: profile.accessToken,
          refreshToken: profile.refreshToken,
          expiresAt: profile.expiresAt,
        },
      });
      redirectWith(res, returnTo, { connected: platform });
    } catch (error) {
      const message = error instanceof HttpError ? error.message : `Could not connect ${platform}`;
      redirectWith(res, returnTo, { socialError: message });
    }
  }),
);

creatorRouter.get(
  "/profile",
  asyncHandler(async (req, res) => {
    res.json({ profile: req.user?.creatorProfile ?? null });
  }),
);

creatorRouter.put(
  "/profile",
  asyncHandler(async (req, res) => {
    const body = creatorSchema.parse(req.body);
    const counts: Record<string, number> = {};
    const ranges: Record<string, string> = {};
    const socialLinks: Record<string, string> = {};
    const legacyMap: Record<string, string> = {
      "0-10k": "5k-10k",
      "10k-50k": "25k-50k",
      "50k-100k": "50k-100k",
      "100k+": "above-100k",
    };
    for (const platform of body.socialPlatforms) {
      if (platform === "Other") continue;
      const key = platform.toLowerCase();
      const rawRangeId = body.followerRanges?.[platform] ?? body.followerRanges?.[key];
      const normalizedRangeId = rawRangeId ? (legacyMap[rawRangeId] ?? rawRangeId) : undefined;
      const range = FOLLOWER_ESTIMATES.find((item) => item.id === normalizedRangeId);
      const explicitCount = body.followerCounts?.[platform] ?? body.followerCounts?.[key];
      if (range) {
        ranges[platform] = range.id;
        counts[platform] = explicitCount != null ? explicitCount : range.min;
      } else if (explicitCount != null) {
        counts[platform] = explicitCount;
      }
      socialLinks[key] = (body.socialLinks as Record<string, string | undefined> | undefined)?.[key]?.trim() ?? "";
    }
    const totalFollowers = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const gpayUpi = normalizeGpayUpi(body.gpayUpi);
    if (!gpayUpi) throw new HttpError(400, "Enter a valid UPI ID or mobile number for payouts.");
    const data = {
      name: body.name,
      bio: body.bio,
      city: body.city,
      niche: body.niche,
      gpayUpi,
      socialPlatforms: body.socialPlatforms,
      socialLinks,
      followerCounts: counts,
      followerRanges: ranges,
      totalFollowers,
      engagementRate: null,
      pricing: null,
      onboardingComplete: true,
    };
    const profile = await prisma.creatorProfile.upsert({
      where: { userId: req.user!.id },
      update: data,
      create: { userId: req.user!.id, ...data },
    });
    res.json({ profile });
  }),
);

creatorRouter.post(
  "/avatar",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Choose an image");
    if (!["image/jpeg", "image/png", "image/webp"].includes(req.file.mimetype)) {
      throw new HttpError(400, "Use a JPG, PNG, or WebP image");
    }
    if (!req.user?.creatorProfile) throw new HttpError(400, "Complete your profile first");
    const ext = req.file.mimetype === "image/png" ? "png" : req.file.mimetype === "image/webp" ? "webp" : "jpg";
    const key = `profiles/${req.user.id}/avatar.${ext}`;
    await writeUpload(key, req.file.buffer);
    const profile = await prisma.creatorProfile.update({
      where: { id: req.user.creatorProfile.id },
      data: { profileImage: key },
    });
    res.json({ profile });
  }),
);

creatorRouter.post(
  "/banner",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Choose an image");
    if (!["image/jpeg", "image/png", "image/webp"].includes(req.file.mimetype)) {
      throw new HttpError(400, "Use a JPG, PNG, or WebP image");
    }
    if (!req.user?.creatorProfile) throw new HttpError(400, "Complete your profile first");
    const ext = req.file.mimetype === "image/png" ? "png" : req.file.mimetype === "image/webp" ? "webp" : "jpg";
    const key = `profiles/${req.user.id}/banner.${ext}`;
    await writeUpload(key, req.file.buffer);
    const profile = await prisma.creatorProfile.update({
      where: { id: req.user.creatorProfile.id },
      data: { bannerImage: key },
    });
    res.json({ profile });
  }),
);
