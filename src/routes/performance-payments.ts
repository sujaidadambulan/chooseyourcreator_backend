import { Router } from "express";
import { z } from "zod";
import { requireRole, requireUser } from "../auth.js";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { notifyBrand, notifyCreator } from "../notifications.js";
import { formatInr } from "../shared/index.js";

export const performancePaymentRouter = Router();
performancePaymentRouter.use(requireUser);

type PerformanceTier = {
  views: number;
  amount: number;
  label?: string;
};

// GET /api/performance-payments
// List performance payment requests for current user (brand or creator)
performancePaymentRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const brandId = req.user?.brandProfile?.id;
    const creatorId = req.user?.creatorProfile?.id;
    const agreementId = req.query.agreementId ? String(req.query.agreementId) : undefined;

    if (!brandId && !creatorId) {
      throw new HttpError(400, "Profile not found");
    }

    const requests = await prisma.performancePaymentRequest.findMany({
      where: {
        ...(brandId ? { brandId } : { creatorId: creatorId! }),
        ...(agreementId ? { agreementId } : {}),
      },
      include: {
        agreement: {
          select: {
            id: true,
            status: true,
            performanceTiers: true,
            agreementData: true,
            campaign: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
      orderBy: [{ agreementId: "asc" }, { tierIndex: "asc" }, { createdAt: "desc" }],
    });

    const creatorIds = [...new Set(requests.map((r) => r.creatorId))];
    const creators = creatorIds.length > 0
      ? await prisma.creatorProfile.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, name: true, profileImage: true, totalFollowers: true },
        })
      : [];

    const enriched = requests.map((reqItem) => ({
      ...reqItem,
      creator: creators.find((c) => c.id === reqItem.creatorId) ?? null,
    }));

    res.json({ requests: enriched });
  }),
);

// POST /api/performance-payments
// Creator requests a performance bonus tier sequentially
performancePaymentRouter.post(
  "/",
  requireRole("CREATOR"),
  asyncHandler(async (req, res) => {
    const creatorId = req.user?.creatorProfile?.id;
    if (!creatorId) throw new HttpError(400, "Complete your creator profile first");

    const body = z
      .object({
        agreementId: z.string().min(1, "Agreement ID is required"),
        tierIndex: z.number().int().min(0, "Tier index must be 0 or greater"),
        currentViews: z.number().int().positive("Enter the current view count reached"),
        proofUrl: z.string().optional(),
      })
      .parse(req.body);

    const agreement = await prisma.agreement.findUnique({
      where: { id: body.agreementId },
      include: {
        campaign: { select: { id: true, title: true } },
        collaboration: { select: { id: true, status: true } },
      },
    });

    if (!agreement || agreement.creatorId !== creatorId) {
      throw new HttpError(404, "Agreement not found");
    }

    // 1. Initial payment check: Must be RELEASED first before any performance bonus can be requested
    const initialPayment = await prisma.payment.findFirst({
      where: {
        campaignId: agreement.campaignId,
        creatorId,
        type: "INITIAL_HELD",
      },
    });

    if (!initialPayment || initialPayment.initialStatus !== "RELEASED") {
      throw new HttpError(
        400,
        "Performance bonuses can only be requested after your initial payment has been released.",
      );
    }

    // 2. Extract performance tiers from agreement
    const rawTiers =
      Array.isArray(agreement.performanceTiers) && (agreement.performanceTiers as unknown[]).length > 0
        ? (agreement.performanceTiers as unknown as PerformanceTier[])
        : Array.isArray((agreement.agreementData as Record<string, unknown>)?.performanceTiers)
        ? ((agreement.agreementData as Record<string, unknown>).performanceTiers as PerformanceTier[])
        : [];

    if (rawTiers.length === 0) {
      throw new HttpError(400, "This agreement has no view-based performance milestone tiers configured.");
    }

    if (body.tierIndex >= rawTiers.length) {
      throw new HttpError(400, `Invalid milestone tier index. Maximum tier is ${rawTiers.length}.`);
    }

    const targetTier = rawTiers[body.tierIndex];

    // 3. Sequential requirement: Tier N can ONLY be requested after Tier N-1 is PAID
    if (body.tierIndex > 0) {
      const prevIndex = body.tierIndex - 1;
      const prevRequest = await prisma.performancePaymentRequest.findFirst({
        where: {
          agreementId: agreement.id,
          tierIndex: prevIndex,
        },
      });

      if (!prevRequest || prevRequest.status !== "PAID") {
        throw new HttpError(
          400,
          `Milestone ${prevIndex + 1} bonus must be paid and completed by the brand before you can request Milestone ${body.tierIndex + 1}.`,
        );
      }
    }

    // 4. Duplicate request check for this tierIndex
    const existing = await prisma.performancePaymentRequest.findFirst({
      where: {
        agreementId: agreement.id,
        tierIndex: body.tierIndex,
      },
    });

    if (existing) {
      if (existing.status === "PAID") {
        throw new HttpError(400, `Milestone ${body.tierIndex + 1} bonus has already been paid.`);
      }
      if (existing.status === "PENDING" || existing.status === "APPROVED") {
        throw new HttpError(
          400,
          `A bonus request for Milestone ${body.tierIndex + 1} is already pending review with the brand.`,
        );
      }
    }

    // 5. Create the performance payment request
    const created = await prisma.performancePaymentRequest.create({
      data: {
        agreementId: agreement.id,
        campaignId: agreement.campaignId,
        creatorId,
        brandId: agreement.brandId,
        tierIndex: body.tierIndex,
        viewsTarget: targetTier.views,
        amount: targetTier.amount,
        currentViews: body.currentViews,
        proofUrl: body.proofUrl?.trim() || null,
        status: "PENDING",
      },
    });

    // Notify brand
    const tierName = targetTier.label || `Milestone ${body.tierIndex + 1}`;
    const creatorName = req.user?.creatorProfile?.name ?? "Creator";
    void notifyBrand(agreement.brandId, {
      title: `Performance bonus requested (${tierName})`,
      message: `${creatorName} requested ₹${targetTier.amount.toLocaleString("en-IN")} bonus for reaching ${body.currentViews.toLocaleString("en-IN")} views (${targetTier.views.toLocaleString("en-IN")} target) on "${agreement.campaign.title}".`,
      type: "PAYMENT",
      link: "/brand/payments",
    });

    res.status(201).json({ request: created });
  }),
);

// POST /api/performance-payments/:id/approve-pay
// Brand approves and marks the sequential milestone bonus as paid
performancePaymentRouter.post(
  "/:id/approve-pay",
  requireRole("BRAND"),
  asyncHandler(async (req, res) => {
    const brandId = req.user?.brandProfile?.id;
    if (!brandId) throw new HttpError(400, "Complete your brand profile first");

    const request = await prisma.performancePaymentRequest.findUnique({
      where: { id: String(req.params.id) },
      include: {
        agreement: {
          select: {
            id: true,
            performanceTiers: true,
            agreementData: true,
            campaign: { select: { id: true, title: true } },
          },
        },
      },
    });

    if (!request || request.brandId !== brandId) {
      throw new HttpError(404, "Performance payment request not found");
    }

    if (request.status === "PAID") {
      res.json({ request });
      return;
    }

    const updated = await prisma.performancePaymentRequest.update({
      where: { id: request.id },
      data: { status: "PAID" },
    });

    // Check if all tiers are now paid
    const rawTiers =
      Array.isArray(request.agreement.performanceTiers) && (request.agreement.performanceTiers as unknown[]).length > 0
        ? (request.agreement.performanceTiers as unknown as PerformanceTier[])
        : Array.isArray((request.agreement.agreementData as Record<string, unknown>)?.performanceTiers)
        ? ((request.agreement.agreementData as Record<string, unknown>).performanceTiers as PerformanceTier[])
        : [];

    if (rawTiers.length > 0) {
      const allPaidCount = await prisma.performancePaymentRequest.count({
        where: {
          agreementId: request.agreementId,
          status: "PAID",
        },
      });

      if (allPaidCount >= rawTiers.length) {
        // Mark PERFORMANCE_DIRECT payment as PAID_DIRECTLY if exists
        await prisma.payment.updateMany({
          where: {
            campaignId: request.campaignId,
            creatorId: request.creatorId,
            type: "PERFORMANCE_DIRECT",
          },
          data: { performanceStatus: "PAID_DIRECTLY" },
        });
      }
    }

    // Notify creator
    void notifyCreator(request.creatorId, {
      title: `Performance bonus paid! (Milestone ${request.tierIndex + 1})`,
      message: `The brand confirmed payment of your Milestone ${request.tierIndex + 1} bonus: ₹${request.amount.toLocaleString("en-IN")} has been settled directly!`,
      type: "PAYMENT",
      link: "/creator/payments",
    });

    res.json({ request: updated });
  }),
);
