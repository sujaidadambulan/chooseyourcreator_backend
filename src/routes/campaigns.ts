import { PLATFORMS, PRICE_RANGES, rupeesToPaise } from "../shared/index.js";
import { Router } from "express";
import { z } from "zod";
import { requireRole, requireUser } from "../auth.js";
import { prisma } from "../db.js";
import {
  applyEligibility,
  assertApplicationTransition,
  assertCampaignTransition,
  assertCollaborationTransition,
  assertInvitationTransition,
  canAcceptAnotherCreator,
  canEditCampaign,
  invitationAcceptEligibility,
  occupiesSlot,
} from "../domain.js";
import { asyncHandler, HttpError } from "../http.js";
import { ensureConversation, expireDueCampaigns, filledSlots } from "../workflow.js";
import { notifyBrand, notifyCreator } from "../notifications.js";

export const campaignRouter = Router();

const campaignSchema = z.object({
  title: z.string().min(3, "Enter a campaign title"),
  productName: z.string().min(2, "Enter the product name"),
  productDetails: z.string().min(2, "Enter product details"),
  description: z.string().optional().default(""),
  campaignType: z.enum(["PUBLIC", "PRIVATE"]),
  niche: z.string().min(2),
  platform: z.string().min(2).optional(),
  platforms: z.array(z.enum(PLATFORMS)).min(1).optional(),
  priceRange: z.string().optional(),
  estimatedPrice: z.number().positive("Enter the campaign price in rupees").optional(),
  creatorSlots: z.number().int().positive(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  deliverables: z.string().min(2, "Describe the deliverables"),
  requirements: z.string().min(2, "Add campaign requirements"),
  instructions: z.string().optional().default(""),
  performanceTerms: z.string().optional().default(""),
  publish: z.boolean().optional(),
});

function campaignWindow(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) {
    const start = new Date();
    const end = new Date();
    end.setFullYear(end.getFullYear() + 1);
    return { start, end };
  }
  return parseDates(startDate, endDate);
}

function resolvePlatforms(body: { platform?: string; platforms?: string[] }) {
  const platforms = body.platforms?.length ? body.platforms : body.platform ? [body.platform] : [];
  if (platforms.length === 0) throw new HttpError(400, "Choose at least one platform");
  return { platforms, platform: platforms.join(", ") };
}

function resolvePrice(body: { priceRange?: string; estimatedPrice?: number }) {
  if (body.priceRange) {
    const range = PRICE_RANGES.find((item) => item.id === body.priceRange);
    if (!range) throw new HttpError(400, "Choose a price range");
    return { priceRange: range.id, estimatedPrice: rupeesToPaise(range.minRupees) };
  }
  if (!body.estimatedPrice) throw new HttpError(400, "Choose a price range");
  return { priceRange: "", estimatedPrice: rupeesToPaise(body.estimatedPrice) };
}

function parseDates(startDate: string, endDate: string) {
  const start = new Date(startDate.length === 10 ? `${startDate}T00:00:00` : startDate);
  const end = new Date(endDate.length === 10 ? `${endDate}T23:59:59` : endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new HttpError(400, "End date must be after the start date");
  }
  return { start, end };
}

async function ownCampaign(brandId: string, campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.brandId !== brandId) throw new HttpError(404, "Campaign not found");
  return campaign;
}

campaignRouter.use(requireUser);

campaignRouter.get(
  "/",
  requireRole("BRAND"),
  asyncHandler(async (req, res) => {
    await expireDueCampaigns();
    const brandId = req.user?.brandProfile?.id;
    if (!brandId) throw new HttpError(400, "Complete your brand profile first");
    const campaigns = await prisma.campaign.findMany({
      where: { brandId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { applications: true, collaborations: true } } },
    });
    res.json({ campaigns });
  }),
);

campaignRouter.post(
  "/",
  requireRole("BRAND"),
  asyncHandler(async (req, res) => {
    const brandId = req.user?.brandProfile?.id;
    if (!brandId) throw new HttpError(400, "Complete your brand profile first");
    const body = campaignSchema.parse(req.body);
    const { start, end } = campaignWindow(body.startDate, body.endDate);
    const platforms = resolvePlatforms(body);
    const price = resolvePrice(body);
    const expired = end.getTime() < Date.now();
    const status = expired ? "EXPIRED" : body.publish ? "OPEN" : "DRAFT";
    if (body.publish && !expired) assertCampaignTransition("DRAFT", "OPEN");
    const campaign = await prisma.campaign.create({
      data: {
        brandId,
        title: body.title,
        productName: body.productName,
        productDetails: body.productDetails,
        description: body.description,
        campaignType: body.campaignType,
        niche: body.niche,
        platform: platforms.platform,
        platforms: platforms.platforms,
        priceRange: price.priceRange,
        estimatedPrice: price.estimatedPrice,
        creatorSlots: body.creatorSlots,
        startDate: start,
        endDate: end,
        deliverables: body.deliverables,
        requirements: body.requirements,
        instructions: body.instructions ?? "",
        performanceTerms: body.performanceTerms ?? "",
        status,
      },
    });
    res.status(201).json({ campaign });
  }),
);

campaignRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    await expireDueCampaigns();
    const id = String(req.params.id);
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        brand: true,
        applications: { include: { creator: true } },
        invitations: { include: { creator: true } },
        collaborations: { include: { creator: true, agreement: true, submissions: true, review: true } },
        payments: true,
      },
    });
    if (!campaign) throw new HttpError(404, "Campaign not found");
    const brandId = req.user?.brandProfile?.id;
    const creatorId = req.user?.creatorProfile?.id;
    if (brandId && campaign.brandId === brandId) {
      res.json({ campaign });
      return;
    }
    if (creatorId) {
      const invited = campaign.invitations.some((item) => item.creatorId === creatorId);
      if (campaign.campaignType === "PRIVATE" && !invited) throw new HttpError(404, "Campaign not found");
      const mine = {
        ...campaign,
        applications: campaign.applications.filter((item) => item.creatorId === creatorId),
        invitations: campaign.invitations.filter((item) => item.creatorId === creatorId),
        collaborations: campaign.collaborations.filter((item) => item.creatorId === creatorId),
        payments: campaign.payments.filter((item) => item.creatorId === creatorId),
      };
      res.json({ campaign: mine });
      return;
    }
    throw new HttpError(403, "You do not have access to this campaign");
  }),
);

campaignRouter.put(
  "/:id",
  requireRole("BRAND"),
  asyncHandler(async (req, res) => {
    const brandId = req.user?.brandProfile?.id;
    if (!brandId) throw new HttpError(400, "Complete your brand profile first");
    const existing = await ownCampaign(brandId, String(req.params.id));
    const active = await prisma.collaboration.count({
      where: { campaignId: existing.id, status: { notIn: ["APPLIED", "INVITED", "REJECTED", "WITHDRAWN", "EXPIRED"] } },
    });
    if (!canEditCampaign(existing.status, active)) {
      throw new HttpError(400, "This campaign can no longer be edited");
    }
    const body = campaignSchema.omit({ publish: true }).parse(req.body);
    const datesProvided = Boolean(body.startDate && body.endDate);
    const { start, end } = datesProvided
      ? parseDates(body.startDate!, body.endDate!)
      : { start: existing.startDate, end: existing.endDate };
    const platforms = resolvePlatforms(body);
    const price = resolvePrice(body);
    const campaign = await prisma.campaign.update({
      where: { id: existing.id },
      data: {
        title: body.title,
        productName: body.productName,
        productDetails: body.productDetails,
        description: body.description,
        campaignType: body.campaignType,
        niche: body.niche,
        platform: platforms.platform,
        platforms: platforms.platforms,
        priceRange: price.priceRange,
        estimatedPrice: price.estimatedPrice,
        creatorSlots: body.creatorSlots,
        deliverables: body.deliverables,
        requirements: body.requirements,
        ...(datesProvided ? { startDate: start, endDate: end } : {}),
        instructions: body.instructions ?? "",
        performanceTerms: body.performanceTerms ?? "",
        status: end.getTime() < Date.now() && existing.status === "OPEN" ? "EXPIRED" : existing.status,
      },
    });
    res.json({ campaign });
  }),
);

campaignRouter.post(
  "/:id/publish",
  requireRole("BRAND"),
  asyncHandler(async (req, res) => {
    const brandId = req.user?.brandProfile?.id;
    if (!brandId) throw new HttpError(400, "Complete your brand profile first");
    const existing = await ownCampaign(brandId, String(req.params.id));
    if (existing.status === "CANCELLED" || existing.status === "CLOSED") {
      throw new HttpError(400, "This campaign can no longer be published");
    }
    const expiredWindow = existing.endDate.getTime() < Date.now();
    const start = expiredWindow ? new Date() : existing.startDate;
    const end = expiredWindow ? new Date(new Date().setFullYear(new Date().getFullYear() + 1)) : existing.endDate;
    if (existing.status !== "OPEN") {
      assertCampaignTransition(existing.status === "EXPIRED" ? "DRAFT" : existing.status, "OPEN");
    }
    const campaign = await prisma.campaign.update({
      where: { id: existing.id },
      data: { status: "OPEN", startDate: start, endDate: end },
    });
    res.json({ campaign });
  }),
);

campaignRouter.post(
  "/:id/cancel",
  requireRole("BRAND"),
  asyncHandler(async (req, res) => {
    const brandId = req.user!.brandProfile!.id;
    const existing = await ownCampaign(brandId, String(req.params.id));
    const active = await prisma.collaboration.count({
      where: { campaignId: existing.id, status: { in: ["PAYMENT_PENDING", "ACTIVE", "CONTENT_SUBMITTED", "PAYMENT_REQUESTED", "COMPLETED"] } },
    });
    if (active > 0) throw new HttpError(400, "Campaigns with active collaborations cannot be cancelled");
    assertCampaignTransition(existing.status, "CANCELLED");
    const campaign = await prisma.campaign.update({ where: { id: existing.id }, data: { status: "CANCELLED" } });
    res.json({ campaign });
  }),
);

campaignRouter.delete(
  "/:id",
  requireRole("BRAND"),
  asyncHandler(async (req, res) => {
    const brandId = req.user!.brandProfile!.id;
    const existing = await ownCampaign(brandId, String(req.params.id));
    const active = await prisma.collaboration.count({
      where: {
        campaignId: existing.id,
        status: { in: ["ACTIVE", "CONTENT_SUBMITTED", "PAYMENT_REQUESTED", "COMPLETED"] },
      },
    });
    if (active > 0) {
      throw new HttpError(400, "Campaigns where creators have already taken work cannot be deleted. You can close or cancel the campaign instead.");
    }

    const [convs, collabs] = await Promise.all([
      prisma.conversation.findMany({ where: { campaignId: existing.id }, select: { id: true } }),
      prisma.collaboration.findMany({ where: { campaignId: existing.id }, select: { id: true } }),
    ]);
    const convIds = convs.map((c) => c.id);
    const collabIds = collabs.map((c) => c.id);

    // Cascade delete in a safe transaction
    await prisma.$transaction([
      ...(convIds.length > 0 ? [prisma.message.deleteMany({ where: { conversationId: { in: convIds } } })] : []),
      prisma.conversation.deleteMany({ where: { campaignId: existing.id } }),
      prisma.performancePaymentRequest.deleteMany({ where: { campaignId: existing.id } }),
      prisma.submission.deleteMany({ where: { campaignId: existing.id } }),
      prisma.payment.deleteMany({ where: { campaignId: existing.id } }),
      prisma.agreement.deleteMany({ where: { campaignId: existing.id } }),
      ...(collabIds.length > 0 ? [prisma.creatorReview.deleteMany({ where: { collaborationId: { in: collabIds } } })] : []),
      prisma.collaboration.deleteMany({ where: { campaignId: existing.id } }),
      prisma.application.deleteMany({ where: { campaignId: existing.id } }),
      prisma.invitation.deleteMany({ where: { campaignId: existing.id } }),
      prisma.campaign.delete({ where: { id: existing.id } }),
    ]);

    res.json({ ok: true, message: "Campaign deleted successfully." });
  }),
);

campaignRouter.post(
  "/:id/apply",
  requireRole("CREATOR"),
  asyncHandler(async (req, res) => {
    await expireDueCampaigns();
    const creator = req.user?.creatorProfile;
    if (!creator?.onboardingComplete) throw new HttpError(400, "Complete your profile before applying");
    const body = z.object({ message: z.string().max(1000).optional() }).parse(req.body ?? {});
    const campaign = await prisma.campaign.findUnique({ where: { id: String(req.params.id) } });
    if (!campaign) throw new HttpError(404, "Campaign not found");
    const existing = await prisma.application.findUnique({
      where: { campaignId_creatorId: { campaignId: campaign.id, creatorId: creator.id } },
    });
    const decision = applyEligibility({
      campaignType: campaign.campaignType,
      campaignStatus: campaign.status,
      endDate: campaign.endDate,
      existingStatus: existing?.status,
    });
    if (!decision.ok) throw new HttpError(400, decision.reason);
    if (existing) assertApplicationTransition(existing.status, "PENDING");
    const application = existing
      ? await prisma.application.update({
          where: { id: existing.id },
          data: { status: "PENDING", message: body.message ?? "" },
        })
      : await prisma.application.create({
          data: { campaignId: campaign.id, creatorId: creator.id, message: body.message ?? "" },
        });
    const collaboration = await prisma.collaboration.findUnique({
      where: { campaignId_creatorId: { campaignId: campaign.id, creatorId: creator.id } },
    });
    if (collaboration) {
      assertCollaborationTransition(collaboration.status, "APPLIED");
      await prisma.collaboration.update({ where: { id: collaboration.id }, data: { status: "APPLIED" } });
    } else {
      await prisma.collaboration.create({
        data: { campaignId: campaign.id, creatorId: creator.id, status: "APPLIED" },
      });
    }
    await ensureConversation(campaign.id, campaign.brandId, creator.id);
    // Notify brand of new application
    void notifyBrand(campaign.brandId, {
      title: "New application received",
      message: `${creator.name} applied to "${campaign.title}"`,
      type: "APPLICATION",
      link: `/brand/campaigns/${campaign.id}`,
    });
    res.status(201).json({ application });
  }),
);

campaignRouter.post(
  "/:id/invite",
  requireRole("BRAND"),
  asyncHandler(async (req, res) => {
    await expireDueCampaigns();
    const brandId = req.user!.brandProfile!.id;
    const body = z
      .object({ creatorId: z.string(), message: z.string().max(1000).optional() })
      .parse(req.body);
    const campaign = await ownCampaign(brandId, String(req.params.id));
    if (campaign.campaignType !== "PRIVATE") throw new HttpError(400, "Only private campaigns can be invited");
    if (campaign.status !== "OPEN" || campaign.endDate.getTime() < Date.now()) {
      throw new HttpError(400, "This campaign is not accepting invitations");
    }
    const filled = await filledSlots(campaign.id);
    if (!canAcceptAnotherCreator(filled, campaign.creatorSlots)) {
      throw new HttpError(400, "All creator slots are filled");
    }
    const creator = await prisma.creatorProfile.findUnique({ where: { id: body.creatorId } });
    if (!creator) throw new HttpError(404, "Creator not found");
    const existing = await prisma.invitation.findUnique({
      where: { campaignId_creatorId: { campaignId: campaign.id, creatorId: creator.id } },
    });
    if (existing && (existing.status === "SENT" || existing.status === "VIEWED" || existing.status === "ACCEPTED")) {
      throw new HttpError(400, "This creator already has an invitation");
    }
    if (existing) assertInvitationTransition(existing.status, "SENT");
    const invitation = existing
      ? await prisma.invitation.update({
          where: { id: existing.id },
          data: { status: "SENT", message: body.message ?? "", expiresAt: campaign.endDate },
        })
      : await prisma.invitation.create({
          data: {
            campaignId: campaign.id,
            creatorId: creator.id,
            message: body.message ?? "",
            expiresAt: campaign.endDate,
          },
        });
    const collaboration = await prisma.collaboration.findUnique({
      where: { campaignId_creatorId: { campaignId: campaign.id, creatorId: creator.id } },
    });
    if (collaboration) {
      if (occupiesSlot(collaboration.status)) throw new HttpError(400, "This creator is already on the campaign");
      assertCollaborationTransition(collaboration.status, "INVITED");
      await prisma.collaboration.update({ where: { id: collaboration.id }, data: { status: "INVITED" } });
    } else {
      await prisma.collaboration.create({
        data: { campaignId: campaign.id, creatorId: creator.id, status: "INVITED" },
      });
    }
    await ensureConversation(campaign.id, campaign.brandId, creator.id);
    // Notify creator of new invitation
    void notifyCreator(creator.id, {
      title: "You have a new campaign invitation",
      message: `You were invited to join "${campaign.title}"`,
      type: "INVITATION",
      link: `/creator`,
    });
    res.status(201).json({ invitation });
  }),
);

export const applicationRouter = Router();
applicationRouter.use(requireUser);

applicationRouter.get(
  "/campaigns/:id/applications",
  requireRole("BRAND"),
  asyncHandler(async (req, res) => {
    const campaign = await ownCampaign(req.user!.brandProfile!.id, String(req.params.id));
    const applications = await prisma.application.findMany({
      where: { campaignId: campaign.id },
      include: { creator: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ applications });
  }),
);

applicationRouter.put(
  "/applications/:id",
  requireRole("BRAND"),
  asyncHandler(async (req, res) => {
    await expireDueCampaigns();
    const body = z.object({ status: z.enum(["ACCEPTED", "REJECTED"]) }).parse(req.body);
    const application = await prisma.application.findUnique({
      where: { id: String(req.params.id) },
      include: { campaign: true },
    });
    if (!application || application.campaign.brandId !== req.user!.brandProfile!.id) {
      throw new HttpError(404, "Application not found");
    }
    if (application.campaign.endDate.getTime() < Date.now() || application.campaign.status === "EXPIRED") {
      throw new HttpError(400, "This campaign is no longer accepting applications");
    }
    assertApplicationTransition(application.status, body.status);
    const collaboration = await prisma.collaboration.findUnique({
      where: { campaignId_creatorId: { campaignId: application.campaignId, creatorId: application.creatorId } },
    });
    if (!collaboration) throw new HttpError(400, "Collaboration record is missing");
    if (body.status === "ACCEPTED") {
      const filled = await filledSlots(application.campaignId);
      if (!canAcceptAnotherCreator(filled, application.campaign.creatorSlots)) {
        throw new HttpError(400, "All creator slots are filled");
      }
      assertCollaborationTransition(collaboration.status, "AGREEMENT_PENDING");
    } else {
      assertCollaborationTransition(collaboration.status, "REJECTED");
    }
    const [updated] = await prisma.$transaction([
      prisma.application.update({ where: { id: application.id }, data: { status: body.status } }),
      prisma.collaboration.update({
        where: { id: collaboration.id },
        data: { status: body.status === "ACCEPTED" ? "AGREEMENT_PENDING" : "REJECTED" },
      }),
    ]);
    // Notify creator of application decision
    void notifyCreator(application.creatorId, {
      title: body.status === "ACCEPTED" ? "Application accepted!" : "Application not accepted",
      message:
        body.status === "ACCEPTED"
          ? `Your application for "${application.campaign.title}" was accepted. An agreement will follow.`
          : `Your application for "${application.campaign.title}" was not selected this time.`,
      type: "APPLICATION",
      link: body.status === "ACCEPTED" ? `/creator/work` : `/creator`,
    });
    res.json({ application: updated });
  }),
);

export const invitationRouter = Router();
invitationRouter.use(requireUser);

invitationRouter.get(
  "/",
  requireRole("CREATOR"),
  asyncHandler(async (req, res) => {
    await expireDueCampaigns();
    const creatorId = req.user?.creatorProfile?.id;
    if (!creatorId) {
      res.json({ invitations: [] });
      return;
    }
    const invitations = await prisma.invitation.findMany({
      where: { creatorId },
      include: { campaign: { include: { brand: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ invitations });
  }),
);

invitationRouter.put(
  "/:id",
  requireRole("CREATOR"),
  asyncHandler(async (req, res) => {
    await expireDueCampaigns();
    const body = z.object({ status: z.enum(["ACCEPTED", "REJECTED", "VIEWED"]) }).parse(req.body);
    const creatorId = req.user?.creatorProfile?.id;
    if (!creatorId) throw new HttpError(400, "Complete your profile first");
    const invitation = await prisma.invitation.findUnique({
      where: { id: String(req.params.id) },
      include: { campaign: true },
    });
    if (!invitation || invitation.creatorId !== creatorId) throw new HttpError(404, "Invitation not found");
    if (body.status === "ACCEPTED") {
      const decision = invitationAcceptEligibility({
        campaignStatus: invitation.campaign.status,
        endDate: invitation.campaign.endDate,
        invitationStatus: invitation.status,
      });
      if (!decision.ok) throw new HttpError(400, decision.reason);
      const filled = await filledSlots(invitation.campaignId);
      if (!canAcceptAnotherCreator(filled, invitation.campaign.creatorSlots)) {
        throw new HttpError(400, "All creator slots are filled");
      }
    }
    assertInvitationTransition(invitation.status, body.status);
    const collaboration = await prisma.collaboration.findUnique({
      where: { campaignId_creatorId: { campaignId: invitation.campaignId, creatorId } },
    });
    if (!collaboration) throw new HttpError(400, "Collaboration record is missing");
    if (body.status === "ACCEPTED") assertCollaborationTransition(collaboration.status, "AGREEMENT_PENDING");
    if (body.status === "REJECTED") assertCollaborationTransition(collaboration.status, "REJECTED");
    const updated = await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: body.status },
    });
    if (body.status === "ACCEPTED" || body.status === "REJECTED") {
      await prisma.collaboration.update({
        where: { id: collaboration.id },
        data: { status: body.status === "ACCEPTED" ? "AGREEMENT_PENDING" : "REJECTED" },
      });
      // Notify brand of creator's response to invitation
      void notifyBrand(invitation.campaign.brandId, {
        title: body.status === "ACCEPTED" ? "Creator accepted invitation" : "Creator declined invitation",
        message:
          body.status === "ACCEPTED"
            ? `A creator accepted your invitation for "${invitation.campaign.title}"."`
            : `A creator declined your invitation for "${invitation.campaign.title}".`,
        type: "INVITATION",
        link: `/brand/campaigns/${invitation.campaignId}`,
      });
    }
    res.json({ invitation: updated });
  }),
);

export const workRouter = Router();
workRouter.use(requireUser, requireRole("CREATOR"));

workRouter.get(
  "/work",
  asyncHandler(async (req, res) => {
    await expireDueCampaigns();
    const creatorId = req.user?.creatorProfile?.id;
    if (!creatorId) {
      res.json({ work: [] });
      return;
    }
    const work = await prisma.collaboration.findMany({
      where: { creatorId },
      include: {
        campaign: { include: { brand: true } },
        agreement: true,
        submissions: true,
      },
      orderBy: { updatedAt: "desc" },
    });
    const campaignIds = work.map((item) => item.campaignId);
    const payments = await prisma.payment.findMany({
      where: { creatorId, campaignId: { in: campaignIds } },
    });
    const workWithPayments = work.map((item) => ({
      ...item,
      payments: payments.filter((p) => p.campaignId === item.campaignId),
    }));
    res.json({ work: workWithPayments });
  }),
);

workRouter.post(
  "/work/applications/:id/withdraw",
  asyncHandler(async (req, res) => {
    const creatorId = req.user!.creatorProfile!.id;
    const application = await prisma.application.findUnique({ where: { id: String(req.params.id) } });
    if (!application || application.creatorId !== creatorId) throw new HttpError(404, "Application not found");
    assertApplicationTransition(application.status, "WITHDRAWN");
    const collaboration = await prisma.collaboration.findUnique({
      where: { campaignId_creatorId: { campaignId: application.campaignId, creatorId } },
    });
    if (collaboration) assertCollaborationTransition(collaboration.status, "WITHDRAWN");
    const [updated] = await prisma.$transaction([
      prisma.application.update({ where: { id: application.id }, data: { status: "WITHDRAWN" } }),
      ...(collaboration
        ? [prisma.collaboration.update({ where: { id: collaboration.id }, data: { status: "WITHDRAWN" } })]
        : []),
    ]);
    res.json({ application: updated });
  }),
);
