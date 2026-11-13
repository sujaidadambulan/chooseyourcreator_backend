import { rupeesToPaise } from "../shared/index.js";
import { Router } from "express";
import { z } from "zod";
import { requireRole, requireUser } from "../auth.js";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { expireDueCampaigns } from "../workflow.js";

export const discoveryRouter = Router();

discoveryRouter.use(requireUser);

discoveryRouter.get(
  "/brand/creators",
  requireRole("BRAND"),
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        q: z.string().optional(),
        niche: z.string().optional(),
        platform: z.string().optional(),
        minFollowers: z.coerce.number().optional(),
        maxFollowers: z.coerce.number().optional(),
      })
      .parse(req.query);

    // When platform is specified and follower range is set, we need to filter
    // against platform-specific followerCounts (stored in JSON) or totalFollowers.
    // Prisma JSON filtering varies by provider; we use a raw approach for JSON filtering
    // but keep totalFollowers as fallback when no platform is selected.
    const hasFollowerFilter = query.minFollowers !== undefined || query.maxFollowers !== undefined;

    const creators = await prisma.creatorProfile.findMany({
      where: {
        onboardingComplete: true,
        ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}),
        ...(query.niche ? { niche: query.niche } : {}),
        ...(query.platform ? { socialPlatforms: { has: query.platform } } : {}),
        // Follower range filter: always use totalFollowers (JSON filtering is
        // unreliable across providers; platform-specific filtering done in JS below)
        ...(hasFollowerFilter && !query.platform
          ? {
              totalFollowers: {
                gte: query.minFollowers,
                lt: query.maxFollowers,
              },
            }
          : {}),
        // When platform is set, use totalFollowers as conservative pre-filter
        ...(hasFollowerFilter && query.platform
          ? {
              totalFollowers: {
                gte: (query.minFollowers ?? 0) > 0 ? Math.floor((query.minFollowers ?? 0) * 0.2) : 0,
              },
            }
          : {}),
      },
      orderBy: { totalFollowers: "desc" },
    });

    // Post-filter: when platform is specified, filter against platform-specific count
    let filtered = creators;
    if (hasFollowerFilter && query.platform) {
      const targetPlatform = query.platform.toLowerCase();
      filtered = creators.filter((creator) => {
        const counts = (creator.followerCounts || {}) as Record<string, number>;
        const matchingKey = Object.keys(counts).find((k) => k.toLowerCase() === targetPlatform);
        const count =
          matchingKey && typeof counts[matchingKey] === "number"
            ? counts[matchingKey]
            : creator.totalFollowers;
        if (query.minFollowers !== undefined && count < query.minFollowers) return false;
        if (query.maxFollowers !== undefined && count >= query.maxFollowers) return false;
        return true;
      });
    }

    res.json({ creators: filtered });
  }),
);

discoveryRouter.get(
  "/brand/creators/:id",
  requireRole("BRAND"),
  asyncHandler(async (req, res) => {
    const creator = await prisma.creatorProfile.findUnique({ where: { id: String(req.params.id) } });
    if (!creator || !creator.onboardingComplete) throw new HttpError(404, "Creator not found");
    res.json({ creator });
  }),
);

discoveryRouter.get(
  "/creator/campaigns",
  requireRole("CREATOR"),
  asyncHandler(async (req, res) => {
    await expireDueCampaigns();
    const query = z
      .object({
        q: z.string().optional(),
        niche: z.string().optional(),
        platform: z.string().optional(),
        priceRange: z.string().optional(),
        minPrice: z.coerce.number().optional(),
        maxPrice: z.coerce.number().optional(),
      })
      .parse(req.query);
    const creatorId = req.user?.creatorProfile?.id;
    const campaigns = await prisma.campaign.findMany({
      where: {
        campaignType: "PUBLIC",
        status: "OPEN",
        endDate: { gte: new Date() },
        ...(query.niche ? { niche: query.niche } : {}),
        ...(query.priceRange ? { priceRange: query.priceRange } : {}),
        ...(query.minPrice !== undefined || query.maxPrice !== undefined
          ? {
              estimatedPrice: {
                gte: query.minPrice !== undefined ? rupeesToPaise(query.minPrice) : undefined,
                lte: query.maxPrice !== undefined ? rupeesToPaise(query.maxPrice) : undefined,
              },
            }
          : {}),
        AND: [
          ...(query.platform
            ? [{
                OR: [
                  { platforms: { has: query.platform } },
                  { platform: { contains: query.platform, mode: "insensitive" as const } },
                ],
              }]
            : []),
          ...(query.q
            ? [{
                OR: [
                  { title: { contains: query.q, mode: "insensitive" as const } },
                  { brand: { companyName: { contains: query.q, mode: "insensitive" as const } } },
                ],
              }]
            : []),
        ],
      },
      include: {
        brand: {
          select: {
            id: true,
            referenceNumber: true,
            companyName: true,
            companyLogo: true,
            bannerImage: true,
            niche: true,
            websiteUrl: true,
            businessDescription: true,
            isVerified: true,
            employeeSize: true,
            role: true,
            socialLinks: true,
          },
        },
        applications: creatorId ? { where: { creatorId }, select: { id: true, status: true } } : false,
      },
      orderBy: { createdAt: "desc" },
    });

    const mapped = campaigns.map((c) => ({
      ...c,
      hasApplied: Boolean(c.applications && c.applications.length > 0),
      applicationStatus: c.applications?.[0]?.status ?? null,
    }));

    res.json({ campaigns: mapped });
  }),
);

discoveryRouter.get(
  "/creator/brands/:id",
  requireRole("CREATOR"),
  asyncHandler(async (req, res) => {
    const brand = await prisma.brandProfile.findUnique({
      where: { id: String(req.params.id) },
      include: {
        campaigns: {
          where: { campaignType: "PUBLIC", status: "OPEN" },
          select: {
            id: true,
            title: true,
            productName: true,
            niche: true,
            platform: true,
            platforms: true,
            estimatedPrice: true,
            priceRange: true,
            creatorSlots: true,
            endDate: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!brand) throw new HttpError(404, "Brand not found");
    res.json({ brand });
  }),
);

discoveryRouter.get(
  "/creator/campaigns/:id",
  requireRole("CREATOR"),
  asyncHandler(async (req, res) => {
    await expireDueCampaigns();
    const id = String(req.params.id);
    const creatorId = req.user?.creatorProfile?.id;
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        brand: true,
        invitations: creatorId ? { where: { creatorId } } : false,
        applications: creatorId ? { where: { creatorId } } : false,
      },
    });
    if (!campaign) throw new HttpError(404, "Campaign not found");
    const invited = campaign.campaignType === "PRIVATE" && (campaign.invitations?.length ?? 0) > 0;
    if (campaign.campaignType === "PRIVATE" && !invited) {
      throw new HttpError(404, "Campaign not found");
    }
    res.json({ campaign });
  }),
);

discoveryRouter.get(
  "/creators/:id/reviews",
  asyncHandler(async (req, res) => {
    const creatorId = String(req.params.id);
    const reviews = await prisma.creatorReview.findMany({
      where: { creatorId },
      orderBy: { createdAt: "desc" },
      include: {
        collaboration: {
          include: {
            campaign: {
              include: {
                brand: {
                  select: { id: true, companyName: true, companyLogo: true },
                },
              },
            },
          },
        },
      },
    });

    res.json({
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        brandName: r.collaboration.campaign.brand.companyName,
        brandLogo: r.collaboration.campaign.brand.companyLogo,
        campaignTitle: r.collaboration.campaign.title,
      })),
    });
  }),
);
