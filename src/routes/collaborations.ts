import { Router } from "express";
import { z } from "zod";
import { requireRole, requireUser } from "../auth.js";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";

export const collaborationRouter = Router();
collaborationRouter.use(requireUser, requireRole("BRAND"));

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});

collaborationRouter.post(
  "/:id/review",
  asyncHandler(async (req, res) => {
    const brandId = req.user!.brandProfile!.id;
    const body = reviewSchema.parse(req.body);
    const collaboration = await prisma.collaboration.findUnique({
      where: { id: String(req.params.id) },
      include: { campaign: { select: { brandId: true } }, review: true },
    });
    if (!collaboration) throw new HttpError(404, "Collaboration not found");
    if (collaboration.campaign.brandId !== brandId) throw new HttpError(403, "Not allowed");
    const allowedForReview = ["PAYMENT_REQUESTED", "COMPLETED"].includes(collaboration.status);
    if (!allowedForReview) {
      throw new HttpError(400, "You can review once deliverables are approved and payment release is authorized");
    }
    if (collaboration.review) throw new HttpError(400, "You already reviewed this collaboration");

    const review = await prisma.creatorReview.create({
      data: {
        collaborationId: collaboration.id,
        brandId,
        creatorId: collaboration.creatorId,
        rating: body.rating,
        comment: body.comment ?? "",
      },
    });
    res.status(201).json({ review });
  }),
);
