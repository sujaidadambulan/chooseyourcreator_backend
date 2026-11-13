import { formatDate, formatInr, rupeesToPaise } from "../shared/index.js";
import { Router } from "express";
import { z } from "zod";
import { requireRole, requireUser } from "../auth.js";
import { prisma } from "../db.js";
import { assertAgreementTransition, assertCollaborationTransition } from "../domain.js";
import { renderAgreementPdf, safeUploadPath, writeUpload } from "../files.js";
import { asyncHandler, HttpError } from "../http.js";
import { notifyBrand, notifyCreator } from "../notifications.js";
import { expireDueCampaigns } from "../workflow.js";
import fs from "node:fs";

export const agreementRouter = Router();
agreementRouter.use(requireUser);

const createSchema = z.object({
  campaignId: z.string(),
  creatorId: z.string(),
  initialPayment: z.number().positive("Enter the initial payment in rupees"),
  performanceAmount: z.number().nonnegative().optional(),
  performanceTerms: z.string().optional(),
  performanceTiers: z
    .array(
      z.object({
        views: z.number().positive(),
        amount: z.number().positive(),
        label: z.string().optional(),
      }),
    )
    .optional(),
  additionalConditions: z.string().optional(),
  deliverables: z.string().min(2),
  contentRequirements: z.string().min(2),
  brandSignatureName: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

async function loadAgreementForUser(id: string, user: Express.Request["user"]) {
  const agreement = await prisma.agreement.findUnique({
    where: { id },
    include: { campaign: { include: { brand: true } }, collaboration: { include: { creator: true } } },
  });
  if (!agreement) throw new HttpError(404, "Agreement not found");
  const allowed =
    user?.brandProfile?.id === agreement.brandId || user?.creatorProfile?.id === agreement.creatorId;
  if (!allowed) throw new HttpError(404, "Agreement not found");
  return agreement;
}

agreementRouter.post(
  "/",
  requireRole("BRAND"),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const brand = req.user?.brandProfile;
    if (!brand) throw new HttpError(400, "Complete your brand profile first");
    const campaign = await prisma.campaign.findUnique({ where: { id: body.campaignId } });
    if (!campaign || campaign.brandId !== brand.id) throw new HttpError(404, "Campaign not found");
    let collaboration = await prisma.collaboration.findUnique({
      where: { campaignId_creatorId: { campaignId: campaign.id, creatorId: body.creatorId } },
      include: { creator: true },
    });
    if (!collaboration) {
      collaboration = await prisma.collaboration.create({
        data: { campaignId: campaign.id, creatorId: body.creatorId, status: "AGREEMENT_PENDING" },
        include: { creator: true },
      });
    } else if (collaboration.status === "APPLIED" || collaboration.status === "INVITED") {
      collaboration = await prisma.collaboration.update({
        where: { id: collaboration.id },
        data: { status: "AGREEMENT_PENDING" },
        include: { creator: true },
      });
    } else if (collaboration.status !== "AGREEMENT_PENDING") {
      throw new HttpError(400, "An agreement cannot be created for this collaboration state: " + collaboration.status);
    }
    if (await prisma.agreement.findUnique({ where: { collaborationId: collaboration.id } })) {
      throw new HttpError(400, "An agreement already exists for this collaboration");
    }

    const rawStart = body.startDate ? new Date(body.startDate) : campaign.startDate;
    const rawEnd = body.endDate ? new Date(body.endDate) : campaign.endDate;
    if (isNaN(rawStart.getTime()) || isNaN(rawEnd.getTime())) {
      throw new HttpError(400, "Please provide valid agreement start and end dates.");
    }
    if (rawEnd.getTime() < rawStart.getTime()) {
      throw new HttpError(400, "Agreement end date must be on or after start date.");
    }

    // Synchronize campaign validity dates
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        startDate: rawStart,
        endDate: rawEnd,
      },
    });

    const initialPaise = rupeesToPaise(body.initialPayment);
    const agreementData = {
      companyName: brand.companyName,
      companyInfo: [brand.businessDescription, brand.websiteUrl].filter(Boolean).join("\n"),
      productName: campaign.productName,
      productDetails: campaign.productDetails,
      creatorName: collaboration.creator.name,
      campaignName: campaign.title,
      startDate: formatDate(rawStart),
      endDate: formatDate(rawEnd),
      startDateIso: rawStart.toISOString(),
      endDateIso: rawEnd.toISOString(),
      deliverables: body.deliverables,
      platform: campaign.platform,
      contentRequirements: body.contentRequirements,
      initialPayment: formatInr(initialPaise),
      initialPaymentPaise: initialPaise,
      performanceAmountPaise: body.performanceAmount ? rupeesToPaise(body.performanceAmount) : 0,
      performanceTerms: body.performanceTerms ?? campaign.performanceTerms,
      performanceTiers: body.performanceTiers ?? [],
      additionalConditions: body.additionalConditions ?? "",
      brandSignedAt: formatDate(new Date()),
      brandSignatureName: body.brandSignatureName || brand.companyName,
    };
    const agreement = await prisma.agreement.create({
      data: {
        campaignId: campaign.id,
        brandId: brand.id,
        creatorId: collaboration.creatorId,
        collaborationId: collaboration.id,
        agreementData,
        campaignStartDate: rawStart,
        campaignEndDate: rawEnd,
        performanceTiers: body.performanceTiers ?? [],
        status: "SENT",
        brandSignedAt: new Date(),
        brandSignatureName: body.brandSignatureName || brand.companyName,
      },
    });
    await expireDueCampaigns();
    const pdf = await renderAgreementPdf({ ...agreementData, creatorSignatureName: null, creatorSignedAt: null });
    const pdfKey = `agreements/${agreement.id}/agreement.pdf`;
    await writeUpload(pdfKey, pdf);
    const saved = await prisma.agreement.update({ where: { id: agreement.id }, data: { pdfKey } });
    // Notify creator that an agreement is waiting for signature
    void notifyCreator(collaboration.creatorId, {
      title: "Agreement ready to sign",
      message: `An agreement for "${campaign.title}" is waiting for your signature.`,
      type: "AGREEMENT",
      link: `/creator/agreements/${agreement.id}`,
    });
    res.status(201).json({ agreement: saved });
  }),
);

agreementRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const agreement = await loadAgreementForUser(String(req.params.id), req.user);
    if (req.user?.creatorProfile?.id === agreement.creatorId && agreement.status === "SENT") {
      assertAgreementTransition(agreement.status, "VIEWED");
      const updated = await prisma.agreement.update({
        where: { id: agreement.id },
        data: { status: "VIEWED" },
      });
      res.json({ agreement: updated });
      return;
    }
    res.json({ agreement });
  }),
);

agreementRouter.get(
  "/:id/pdf",
  asyncHandler(async (req, res) => {
    const agreement = await loadAgreementForUser(String(req.params.id), req.user);
    const key = agreement.signedPdfKey ?? agreement.pdfKey;
    if (!key) throw new HttpError(404, "Agreement PDF is not ready");
    const file = safeUploadPath(key);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="chooseyourcreator-agreement.pdf"`);
    fs.createReadStream(file).pipe(res);
  }),
);

agreementRouter.post(
  "/:id/sign",
  requireRole("CREATOR"),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        signatureName: z.string().min(2, "Type your full name to sign"),
        consent: z.literal(true, { errorMap: () => ({ message: "Consent is required to sign" }) }),
      })
      .parse(req.body);
    const agreement = await loadAgreementForUser(String(req.params.id), req.user);
    if (agreement.creatorId !== req.user?.creatorProfile?.id) {
      throw new HttpError(403, "Only the creator can sign this agreement");
    }
    await expireDueCampaigns();
    if (
      agreement.status === "EXPIRED" ||
      (agreement.campaignEndDate && agreement.campaignEndDate < new Date()) ||
      agreement.campaign.status === "EXPIRED"
    ) {
      throw new HttpError(400, "This agreement has expired as the campaign valid end date has passed.");
    }
    if (agreement.status !== "SENT" && agreement.status !== "VIEWED") {
      throw new HttpError(400, "This agreement cannot be signed");
    }
    assertAgreementTransition(agreement.status, "CREATOR_SIGNED");
    assertAgreementTransition("CREATOR_SIGNED", "ACTIVE");
    assertCollaborationTransition(agreement.collaboration.status, "PAYMENT_PENDING");
    const signedAt = new Date();
    const data = agreement.agreementData as {
      companyName: string;
      companyInfo: string;
      productName: string;
      productDetails: string;
      creatorName: string;
      campaignName: string;
      startDate: string;
      endDate: string;
      deliverables: string;
      platform: string;
      contentRequirements: string;
      initialPayment: string;
      performanceTerms: string;
      additionalConditions: string;
      initialPaymentPaise: number;
      performanceAmountPaise: number;
      brandSignedAt?: string;
    };
    const pdf = await renderAgreementPdf({
      ...data,
      brandSignedAt: data.brandSignedAt ?? null,
      creatorSignatureName: body.signatureName,
      creatorSignedAt: formatDate(signedAt),
    });
    const signedPdfKey = `agreements/${agreement.id}/signed.pdf`;
    await writeUpload(signedPdfKey, pdf);
    const performanceTerms = data.performanceTerms?.trim() ?? "";
    // Get current campaign to check slots
    const currentCampaign = await prisma.campaign.findUnique({
      where: { id: agreement.campaignId },
      select: { creatorSlots: true, status: true },
    });

    const [updated] = await prisma.$transaction([
      prisma.agreement.update({
        where: { id: agreement.id },
        data: {
          status: "ACTIVE",
          creatorSignedAt: signedAt,
          creatorSignatureName: body.signatureName,
          signedPdfKey,
        },
      }),
      prisma.collaboration.update({
        where: { id: agreement.collaborationId },
        data: { status: "PAYMENT_PENDING" },
      }),
      prisma.payment.create({
        data: {
          campaignId: agreement.campaignId,
          creatorId: agreement.creatorId,
          brandId: agreement.brandId,
          type: "INITIAL_HELD",
          amount: data.initialPaymentPaise,
          currency: "INR",
          initialStatus: "PENDING",
        },
      }),
      ...(performanceTerms || data.performanceAmountPaise
        ? [
            prisma.payment.create({
              data: {
                campaignId: agreement.campaignId,
                creatorId: agreement.creatorId,
                brandId: agreement.brandId,
                type: "PERFORMANCE_DIRECT",
                amount: data.performanceAmountPaise ?? 0,
                currency: "INR",
                performanceStatus: "PENDING",
              },
            }),
          ]
        : []),
      // Decrement campaign slots when agreement is signed
      prisma.campaign.update({
        where: { id: agreement.campaignId },
        data: {
          creatorSlots: Math.max(0, (currentCampaign?.creatorSlots ?? 1) - 1),
          // Close campaign if slots reach 0
          status: (currentCampaign?.creatorSlots ?? 1) - 1 <= 0 ? "CLOSED" : currentCampaign?.status,
        },
      }),
    ]);
    // Notify brand that agreement was signed and payment is needed
    void notifyBrand(agreement.brandId, {
      title: "Agreement signed — payment required",
      message: `Creator signed the agreement for "${agreement.campaign.title}". Deposit the initial payment to begin.`,
      type: "AGREEMENT",
      link: `/brand/payments`,
    });
    // Notify creator that signing was recorded
    void notifyCreator(agreement.creatorId, {
      title: "Agreement signed successfully",
      message: `Your agreement for "${agreement.campaign.title}" is active. Awaiting brand payment deposit.`,
      type: "AGREEMENT",
      link: `/creator/payments`,
    });
    res.json({ agreement: updated });
  }),
);

agreementRouter.post(
  "/:id/brand-sign",
  requireRole("BRAND"),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        brandSignatureName: z.string().min(2, "Enter brand authorized signatory name"),
      })
      .parse(req.body);
    const agreement = await loadAgreementForUser(String(req.params.id), req.user);
    if (agreement.brandId !== req.user?.brandProfile?.id) {
      throw new HttpError(403, "Only the brand can sign this agreement");
    }
    const signedAt = new Date();
    const data = ((agreement.agreementData as Record<string, unknown>) || {});
    const updatedData = {
      ...data,
      brandSignatureName: body.brandSignatureName,
      brandSignedAt: formatDate(signedAt),
    };
    const updated = await prisma.agreement.update({
      where: { id: agreement.id },
      data: {
        brandSignatureName: body.brandSignatureName,
        brandSignedAt: signedAt,
        agreementData: updatedData,
      },
    });
    res.json({ agreement: updated });
  }),
);
