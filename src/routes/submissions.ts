import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireRole, requireUser } from "../auth.js";
import { prisma } from "../db.js";
import { assertCollaborationTransition } from "../domain.js";
import { writeUpload } from "../files.js";
import { asyncHandler, HttpError } from "../http.js";
import { notifyBrand, notifyCreator } from "../notifications.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

export const submissionRouter = Router();
submissionRouter.use(requireUser);

submissionRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const campaignId = String(req.query.campaignId ?? "");
    if (!campaignId) throw new HttpError(400, "Campaign is required");
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new HttpError(404, "Campaign not found");
    const brandId = req.user?.brandProfile?.id;
    const creatorId = req.user?.creatorProfile?.id;
    if (brandId !== campaign.brandId && !creatorId) throw new HttpError(403, "You do not have access to these submissions");
    const submissions = await prisma.submission.findMany({
      where: {
        campaignId,
        ...(brandId === campaign.brandId ? {} : { creatorId }),
      },
      orderBy: { submittedAt: "desc" },
    });
    res.json({ submissions });
  }),
);

submissionRouter.post(
  "/",
  requireRole("CREATOR"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        campaignId: z.string(),
        socialUrl: z.string().optional(),
        caption: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    const creatorId = req.user!.creatorProfile!.id;
    const collaboration = await prisma.collaboration.findUnique({
      where: { campaignId_creatorId: { campaignId: body.campaignId, creatorId } },
    });
    if (!collaboration || (collaboration.status !== "ACTIVE" && collaboration.status !== "CONTENT_SUBMITTED")) {
      throw new HttpError(400, "You can submit work once the campaign is active");
    }
    if (!req.file && !body.socialUrl) {
      throw new HttpError(400, "Add a file or a social link");
    }
    let contentKey: string | undefined;
    if (req.file) {
      const allowed = ["video/mp4", "video/quicktime", "image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (!allowed.includes(req.file.mimetype)) throw new HttpError(400, "Unsupported file type");
      const ext = req.file.originalname.split(".").pop() || "bin";
      contentKey = `submissions/${collaboration.id}/${Date.now()}.${ext}`;
      await writeUpload(contentKey, req.file.buffer);
    }
    if (collaboration.status === "ACTIVE") {
      assertCollaborationTransition("ACTIVE", "CONTENT_SUBMITTED");
      await prisma.collaboration.update({
        where: { id: collaboration.id },
        data: { status: "CONTENT_SUBMITTED" },
      });
    }
    const submission = await prisma.submission.create({
      data: {
        campaignId: body.campaignId,
        creatorId,
        collaborationId: collaboration.id,
        contentKey,
        socialUrl: body.socialUrl,
        caption: body.caption ?? "",
        notes: body.notes ?? "",
      },
    });
    // Notify brand about new submission
    const campaign = await prisma.campaign.findUnique({
      where: { id: body.campaignId },
      select: { title: true, brandId: true },
    });
    if (campaign) {
      void notifyBrand(campaign.brandId, {
        title: "New content submission",
        message: `A creator submitted content for "${campaign.title}". Please review.`,
        type: "SUBMISSION",
        link: `/brand/campaigns/${body.campaignId}`,
      });
    }
    res.status(201).json({ submission });
  }),
);

submissionRouter.post(
  "/:id/review",
  requireRole("BRAND"),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        decision: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
        changeRequestReason: z.string().trim().optional(),
      })
      .parse(req.body);
    const submission = await prisma.submission.findUnique({
      where: { id: String(req.params.id) },
      include: { campaign: true, collaboration: true },
    });
    if (!submission || submission.campaign.brandId !== req.user?.brandProfile?.id) {
      throw new HttpError(404, "Submission not found");
    }
    const updated = await prisma.submission.update({
      where: { id: submission.id },
      data: {
        status: body.decision,
        reviewedAt: new Date(),
        ...(body.decision === "CHANGES_REQUESTED"
          ? {
              changeRequestReason: body.changeRequestReason ?? null,
              changeRequestedAt: new Date(),
            }
          : {}),
      },
    });
    if (body.decision === "CHANGES_REQUESTED" && submission.collaboration.status === "CONTENT_SUBMITTED") {
      assertCollaborationTransition("CONTENT_SUBMITTED", "ACTIVE");
      await prisma.collaboration.update({
        where: { id: submission.collaborationId },
        data: { status: "ACTIVE" },
      });
    }
    // Notify creator of review decision
    void notifyCreator(submission.creatorId, {
      title: body.decision === "APPROVED" ? "Submission approved!" : "Changes requested on submission",
      message:
        body.decision === "APPROVED"
          ? `Your content for "${submission.campaign.title}" was approved! You can now request payment release.`
          : `The brand requested changes to your content for "${submission.campaign.title}".${body.changeRequestReason ? ` Reason: ${body.changeRequestReason}` : ""}`,
      type: "SUBMISSION",
      link: `/creator/work`,
    });
    res.json({ submission: updated });
  }),
);
