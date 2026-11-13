import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { requireRole, requireUser } from "../auth.js";
import { prisma } from "../db.js";
import {
  assertAgreementTransition,
  assertCollaborationTransition,
  assertInitialPaymentTransition,
  canReleaseInitialPayment,
} from "../domain.js";
import { asyncHandler, HttpError } from "../http.js";
import { createRazorpayOrder, verifyRazorpayWebhook } from "../payments.js";
import { notifyBrand, notifyCreator } from "../notifications.js";
import { formatInr } from "../shared/index.js";

export const paymentRouter = Router();

export const paymentWebhook = asyncHandler(async (req, res) => {
  const raw = req.body as Buffer;
  const signature = req.header("x-razorpay-signature");
  if (!verifyRazorpayWebhook(raw, signature)) throw new HttpError(400, "Invalid webhook signature");
  const event = JSON.parse(raw.toString()) as {
    event?: string;
    payload?: { payment?: { entity?: { order_id?: string; id?: string } } };
  };
  if (event.event === "payment.captured") {
    const orderId = event.payload?.payment?.entity?.order_id;
    const paymentId = event.payload?.payment?.entity?.id;
    if (orderId) {
      const payment = await prisma.payment.findFirst({
        where: { providerReference: orderId, type: "INITIAL_HELD" },
      });
      if (payment?.initialStatus === "PENDING") {
        assertInitialPaymentTransition("PENDING", "HELD");
        await prisma.payment.update({
          where: { id: payment.id },
          data: { initialStatus: "HELD", providerPaymentId: paymentId },
        });
        const collaboration = await prisma.collaboration.findUnique({
          where: { campaignId_creatorId: { campaignId: payment.campaignId, creatorId: payment.creatorId } },
        });
        if (collaboration?.status === "PAYMENT_PENDING") {
          assertCollaborationTransition(collaboration.status, "ACTIVE");
          await prisma.collaboration.update({ where: { id: collaboration.id }, data: { status: "ACTIVE" } });
        }
      }
    }
  }
  res.json({ ok: true });
});

paymentRouter.use(requireUser);

paymentRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const brandId = req.user?.brandProfile?.id;
    const creatorId = req.user?.creatorProfile?.id;
    const payments = await prisma.payment.findMany({
      where: brandId ? { brandId } : { creatorId: creatorId ?? "none" },
      include: {
        campaign: {
          select: {
            id: true,
            title: true,
            status: true,
            endDate: true,
            brand: { select: { id: true, companyName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const creatorIds = [...new Set(payments.map((item) => item.creatorId))];
    const creators = await prisma.creatorProfile.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, name: true, profileImage: true },
    });

    const pairs = payments.map((p) => ({ campaignId: p.campaignId, creatorId: p.creatorId }));
    const agreements = pairs.length > 0
      ? await prisma.agreement.findMany({
          where: { OR: pairs },
          select: { id: true, campaignId: true, creatorId: true, status: true, brandSignedAt: true, creatorSignedAt: true, performanceTiers: true, agreementData: true },
        })
      : [];

    const collaborations = pairs.length > 0
      ? await prisma.collaboration.findMany({
          where: { OR: pairs },
          select: { id: true, campaignId: true, creatorId: true, status: true, review: { select: { id: true } } },
        })
      : [];

    const approvedSubmissions = pairs.length > 0
      ? await prisma.submission.findMany({
          where: { status: "APPROVED", OR: pairs },
          select: { id: true, campaignId: true, creatorId: true },
        })
      : [];

    const enrichedPayments = payments.map((payment) => {
      const agreement = agreements.find(
        (a) => a.campaignId === payment.campaignId && a.creatorId === payment.creatorId,
      );
      const collaboration = collaborations.find(
        (c) => c.campaignId === payment.campaignId && c.creatorId === payment.creatorId,
      );
      const isApproved = approvedSubmissions.some(
        (s) => s.campaignId === payment.campaignId && s.creatorId === payment.creatorId,
      );

      let canRequestRelease = false;
      let releaseIneligibilityReason: string | null = null;

      if (payment.type === "INITIAL_HELD") {
        if (payment.initialStatus === "HELD") {
          if (isApproved) {
            canRequestRelease = true;
          } else {
            releaseIneligibilityReason = "Submission must be approved by the brand before payment can be requested.";
          }
        } else if (payment.initialStatus === "PENDING") {
          releaseIneligibilityReason = "Initial payment has not been deposited by the brand yet.";
        } else if (payment.initialStatus === "RELEASE_REQUESTED") {
          releaseIneligibilityReason = "Payment release request is currently pending brand approval.";
        } else if (payment.initialStatus === "RELEASED") {
          releaseIneligibilityReason = "Payment has already been released.";
        } else if (payment.initialStatus === "REFUNDED") {
          releaseIneligibilityReason = "This payment was refunded.";
        } else if (payment.initialStatus === "FAILED") {
          releaseIneligibilityReason = "Initial deposit failed.";
        }
      }

      return {
        ...payment,
        creatorName: creators.find((item) => item.id === payment.creatorId)?.name ?? "",
        collaborationId: collaboration?.id ?? null,
        hasReviewed: Boolean(collaboration?.review),
        agreementId: agreement?.id ?? null,
        performanceTiers: (agreement?.performanceTiers as unknown[]) ?? (agreement?.agreementData as Record<string, unknown>)?.performanceTiers ?? [],
        agreementStatus: agreement?.status ?? null,
        collaborationStatus: collaboration?.status ?? null,
        submissionApproved: isApproved,
        canRequestRelease,
        releaseIneligibilityReason,
      };
    });

    res.json({ payments: enrichedPayments });
  }),
);

paymentRouter.post(
  "/initial",
  requireRole("BRAND"),
  asyncHandler(async (req, res) => {
    const body = z.object({
      paymentId: z.string(),
      offlineReference: z.string().optional(),
    }).parse(req.body);
    const brandId = req.user?.brandProfile?.id;
    const payment = await prisma.payment.findUnique({ where: { id: body.paymentId } });
    if (!payment || payment.brandId !== brandId || payment.type !== "INITIAL_HELD") {
      throw new HttpError(404, "Payment not found");
    }
    if (payment.initialStatus !== "PENDING" && payment.initialStatus !== "FAILED") {
      throw new HttpError(400, "This payment has already been made or submitted");
    }

    assertInitialPaymentTransition(payment.initialStatus, "PAYMENT_SUBMITTED");
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        initialStatus: "PAYMENT_SUBMITTED",
        offlineReference: body.offlineReference || "Direct Offline Transfer",
      },
    });

    res.json({ payment: updated, message: "Payment submitted. Awaiting admin verification." });
  }),
);

paymentRouter.post(
  "/:id/request-release",
  requireRole("CREATOR"),
  asyncHandler(async (req, res) => {
    const creatorId = req.user?.creatorProfile?.id;
    const payment = await prisma.payment.findUnique({ where: { id: String(req.params.id) } });
    if (!payment || payment.creatorId !== creatorId || payment.type !== "INITIAL_HELD" || !payment.initialStatus) {
      throw new HttpError(404, "Payment not found");
    }
    const approved = await prisma.submission.findFirst({
      where: { campaignId: payment.campaignId, creatorId: payment.creatorId, status: "APPROVED" },
    });
    const decision = canReleaseInitialPayment({
      paymentStatus: payment.initialStatus,
      submissionApproved: Boolean(approved),
    });
    if (!decision.ok) throw new HttpError(400, decision.reason);
    assertInitialPaymentTransition(payment.initialStatus, "RELEASE_REQUESTED");
    const collaboration = await prisma.collaboration.findUnique({
      where: { campaignId_creatorId: { campaignId: payment.campaignId, creatorId: payment.creatorId } },
    });
    if (!collaboration) throw new HttpError(400, "Collaboration record is missing");
    assertCollaborationTransition(collaboration.status, "PAYMENT_REQUESTED");
    const [updated] = await prisma.$transaction([
      prisma.payment.update({ where: { id: payment.id }, data: { initialStatus: "RELEASE_REQUESTED" } }),
      prisma.collaboration.update({ where: { id: collaboration.id }, data: { status: "PAYMENT_REQUESTED" } }),
    ]);
    // Notify brand that creator requested payment release
    void notifyBrand(payment.brandId, {
      title: "Payment release requested",
      message: `A creator requested release of ${formatInr(payment.amount)} from escrow. Please review and approve.`,
      type: "PAYMENT",
      link: `/brand/payments`,
    });
    res.json({ payment: updated });
  }),
);

paymentRouter.post(
  "/:id/release",
  requireRole("BRAND"),
  asyncHandler(async (req, res) => {
    const brandId = req.user?.brandProfile?.id;
    const payment = await prisma.payment.findUnique({ where: { id: String(req.params.id) } });
    if (!payment || payment.brandId !== brandId || payment.type !== "INITIAL_HELD" || payment.initialStatus !== "RELEASE_REQUESTED") {
      throw new HttpError(400, "This payment is not ready to release");
    }

    // Brand approves release -> moves to RELEASE_AUTHORIZED for admin disbursal
    assertInitialPaymentTransition("RELEASE_REQUESTED", "RELEASE_AUTHORIZED");
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: { initialStatus: "RELEASE_AUTHORIZED" },
    });

    res.json({
      payment: updated,
      message: "Release authorized by brand. Admin will disburse the funds directly to the creator.",
    });
  }),
);

paymentRouter.post(
  "/:id/mark-direct",
  requireRole("BRAND"),
  asyncHandler(async (req, res) => {
    const payment = await prisma.payment.findUnique({ where: { id: String(req.params.id) } });
    if (!payment || payment.brandId !== req.user?.brandProfile?.id || payment.type !== "PERFORMANCE_DIRECT") {
      throw new HttpError(404, "Payment not found");
    }
    if (payment.performanceStatus === "PAID_DIRECTLY") {
      res.json({ payment });
      return;
    }
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: { performanceStatus: "PAID_DIRECTLY" },
    });
    res.json({ payment: updated });
  }),
);

paymentRouter.post(
  "/:id/request-performance",
  requireRole("CREATOR"),
  asyncHandler(async (req, res) => {
    const creatorId = req.user?.creatorProfile?.id;
    if (!creatorId) throw new HttpError(400, "Complete your profile first");

    // Find the PERFORMANCE_DIRECT payment
    const payment = await prisma.payment.findUnique({ where: { id: String(req.params.id) } });
    if (
      !payment ||
      payment.creatorId !== creatorId ||
      payment.type !== "PERFORMANCE_DIRECT"
    ) {
      throw new HttpError(404, "Performance payment not found");
    }
    if (payment.performanceStatus === "PAID_DIRECTLY") {
      throw new HttpError(400, "Performance bonus has already been marked as paid.");
    }

    // Ensure the initial payment for this campaign/creator is released
    const initialPayment = await prisma.payment.findFirst({
      where: { campaignId: payment.campaignId, creatorId, type: "INITIAL_HELD" },
    });
    if (!initialPayment || initialPayment.initialStatus !== "RELEASED") {
      throw new HttpError(
        400,
        "Performance bonus can only be requested after the initial payment is released.",
      );
    }

    // Notify brand
    void notifyBrand(payment.brandId, {
      title: "Performance bonus requested",
      message: `A creator has requested their performance bonus of ${formatInr(payment.amount)}. Please settle directly.`,
      type: "PAYMENT",
      link: `/brand/payments`,
    });

    res.json({ payment, requested: true });
  }),
);
