import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireUser } from "../auth.js";
import { prisma } from "../db.js";
import { deleteUpload, writeUpload } from "../files.js";
import { asyncHandler, HttpError } from "../http.js";
import { createNotification } from "../notifications.js";

import { ensureConversation } from "../workflow.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const MESSAGE_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export const messageRouter = Router();
messageRouter.use(requireUser);

function canAccess(user: Express.Request["user"], conversation: { brandId: string; creatorId: string }) {
  return user?.brandProfile?.id === conversation.brandId || user?.creatorProfile?.id === conversation.creatorId;
}

// Statuses where a creator is allowed to message
// Creators can message only after the brand accepts them
const CREATOR_ALLOWED_COLLAB_STATUSES = new Set([
  "ACCEPTED",
  "AGREEMENT_PENDING",
  "PAYMENT_PENDING",
  "ACTIVE",
  "CONTENT_SUBMITTED",
  "PAYMENT_REQUESTED",
  "COMPLETED",
]);

async function assertCreatorMessagingPermission(
  user: Express.Request["user"],
  conversation: { campaignId: string; creatorId: string; brandId: string },
) {
  // Brands always have access; only restrict creators
  if (!user?.creatorProfile) return;
  const creatorId = user.creatorProfile.id;
  // Look for any valid collaboration between this creator and the conversation's brand
  const collaborations = await prisma.collaboration.findMany({
    where: {
      creatorId,
      campaign: { brandId: conversation.brandId },
    },
    select: { status: true },
  });
  const hasAllowed = collaborations.some((c) => CREATOR_ALLOWED_COLLAB_STATUSES.has(c.status));
  if (!hasAllowed) {
    throw new HttpError(
      403,
      "Messaging is available only after your application is accepted.",
    );
  }
}

messageRouter.post(
  "/find-or-create",
  asyncHandler(async (req, res) => {
    const { campaignId, creatorId } = z.object({ campaignId: z.string(), creatorId: z.string() }).parse(req.body);
    const brandId = req.user?.brandProfile?.id;
    if (!brandId) throw new HttpError(400, "Brand profile required");
    const conversation = await ensureConversation(campaignId, brandId, creatorId);
    res.json({ conversationId: conversation.id });
  }),
);

messageRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const brandId = req.user?.brandProfile?.id;
    const creatorId = req.user?.creatorProfile?.id;
    if (!brandId && !creatorId) {
      res.json({ conversations: [] });
      return;
    }
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [...(brandId ? [{ brandId }] : []), ...(creatorId ? [{ creatorId }] : [])],
      },
      include: {
        campaign: { select: { id: true, title: true, status: true, endDate: true, brand: { select: { companyName: true } } } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    const creatorIds = [...new Set(conversations.map((item) => item.creatorId))];
    const creators = await prisma.creatorProfile.findMany({
      where: { id: { in: creatorIds } },
      select: {
        id: true,
        name: true,
        profileImage: true,
        bannerImage: true,
        city: true,
        niche: true,
        bio: true,
        totalFollowers: true,
        socialPlatforms: true,
        socialLinks: true,
        followerCounts: true,
        followerRanges: true,
      },
    });
    const brands = await prisma.brandProfile.findMany({
      where: { id: { in: conversations.map((item) => item.brandId) } },
      select: {
        id: true,
        companyName: true,
        companyLogo: true,
        bannerImage: true,
        websiteUrl: true,
        niche: true,
        employeeSize: true,
        businessDescription: true,
        socialLinks: true,
      },
    });
    const collaborations = await prisma.collaboration.findMany({
      where: {
        OR: conversations.map((c) => ({
          campaignId: c.campaignId,
          creatorId: c.creatorId,
        })),
      },
      include: {
        agreement: { select: { id: true, status: true } },
      },
    });
    const payments = await prisma.payment.findMany({
      where: {
        type: "INITIAL_HELD",
        OR: conversations.map((c) => ({
          campaignId: c.campaignId,
          creatorId: c.creatorId,
        })),
      },
      select: { campaignId: true, creatorId: true, initialStatus: true },
    });

    // Sort conversations so that the ones with the newest messages appear first
    const mapped = conversations.map((conversation) => {
      const collab = collaborations.find(
        (item) => item.campaignId === conversation.campaignId && item.creatorId === conversation.creatorId,
      );
      const payment = payments.find(
        (p) => p.campaignId === conversation.campaignId && p.creatorId === conversation.creatorId,
      );
      const latestMsgTime = conversation.messages[0]?.createdAt
        ? new Date(conversation.messages[0].createdAt).getTime()
        : new Date(conversation.createdAt).getTime();

      return {
        ...conversation,
        creator: creators.find((item) => item.id === conversation.creatorId) ?? null,
        brand: brands.find((item) => item.id === conversation.brandId) ?? null,
        collaboration: collab
          ? {
              ...collab,
              initialPaymentStatus: payment?.initialStatus ?? null,
            }
          : null,
        _latestTime: latestMsgTime,
      };
    });

    mapped.sort((a, b) => b._latestTime - a._latestTime);

    res.json({
      conversations: mapped.map(({ _latestTime, ...conv }) => conv),
    });
  }),
);

messageRouter.get(
  "/:id/messages",
  asyncHandler(async (req, res) => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: String(req.params.id) },
      include: {
        campaign: {
          select: {
            id: true,
            title: true,
            status: true,
            endDate: true,
            productName: true,
            productDetails: true,
            description: true,
            deliverables: true,
            requirements: true,
            instructions: true,
            performanceTerms: true,
            estimatedPrice: true,
          },
        },
      },
    });
    if (!conversation || !canAccess(req.user, conversation)) throw new HttpError(404, "Conversation not found");
    await assertCreatorMessagingPermission(req.user, conversation);
    const [brand, collaboration, payment, messages] = await Promise.all([
      prisma.brandProfile.findUnique({
        where: { id: conversation.brandId },
        select: {
          id: true,
          companyName: true,
          companyLogo: true,
          bannerImage: true,
          websiteUrl: true,
          niche: true,
          employeeSize: true,
          businessDescription: true,
          socialLinks: true,
        },
      }),
      prisma.collaboration.findUnique({
        where: { campaignId_creatorId: { campaignId: conversation.campaignId, creatorId: conversation.creatorId } },
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              profileImage: true,
              bannerImage: true,
              city: true,
              niche: true,
              bio: true,
              totalFollowers: true,
              socialPlatforms: true,
              socialLinks: true,
              followerCounts: true,
              followerRanges: true,
            },
          },
          agreement: {
            select: {
              id: true,
              status: true,
              agreementData: true,
              brandSignedAt: true,
              creatorSignedAt: true,
              creatorSignatureName: true,
              pdfKey: true,
              signedPdfKey: true,
            },
          },
        },
      }),
      prisma.payment.findFirst({
        where: { campaignId: conversation.campaignId, creatorId: conversation.creatorId, type: "INITIAL_HELD" },
        select: { id: true, initialStatus: true, amount: true },
      }),
      prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "asc" },
        include: { sender: { select: { id: true, role: true } } },
      }),
    ]);
    res.json({
      conversation: {
        ...conversation,
        brand,
        collaboration: collaboration
          ? {
              ...collaboration,
              payment: payment ?? null,
            }
          : null,
      },
      messages,
    });
  }),
);

messageRouter.post(
  "/:id/messages",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: String(req.params.id) },
      include: { campaign: { select: { title: true } } },
    });
    if (!conversation || !canAccess(req.user, conversation)) throw new HttpError(404, "Conversation not found");
    await assertCreatorMessagingPermission(req.user, conversation);

    let content: string;
    let mediaKey: string | undefined;
    let mediaMimeType: string | undefined;

    if (req.file) {
      if (!MESSAGE_MEDIA_TYPES.has(req.file.mimetype)) {
        throw new HttpError(400, "Only photos (JPEG, PNG, WebP, GIF) or videos (MP4, MOV, WebM) are allowed");
      }
      const ext = req.file.originalname.split(".").pop() || "bin";
      mediaKey = `messages/${conversation.id}/${Date.now()}.${ext}`;
      mediaMimeType = req.file.mimetype;
      await writeUpload(mediaKey, req.file.buffer);
      const caption = typeof req.body.content === "string" ? req.body.content.trim().slice(0, 2000) : "";
      content = caption || (req.file.mimetype.startsWith("video/") ? "Shared a video" : "Shared a photo");
    } else {
      const body = z.object({ content: z.string().trim().min(1).max(2000) }).parse(req.body);
      content = body.content;
    }

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: req.user!.id,
        content,
        mediaKey,
        mediaMimeType,
      },
    });
    // Notify the other party
    const senderUserId = req.user!.id;
    const otherUserId = req.user!.brandProfile
      ? await prisma.creatorProfile
          .findUnique({ where: { id: conversation.creatorId }, select: { userId: true } })
          .then((c) => c?.userId)
      : await prisma.brandProfile
          .findUnique({ where: { id: conversation.brandId }, select: { userId: true } })
          .then((b) => b?.userId);
    if (otherUserId && otherUserId !== senderUserId) {
      void createNotification({
        userId: otherUserId,
        title: "New message",
        message: `New message in "${conversation.campaign?.title ?? "campaign"}"`,
        type: "MESSAGE",
        link: req.user!.brandProfile
          ? `/brand/messages/${conversation.id}`
          : `/creator/messages/${conversation.id}`,
      });
    }
    res.status(201).json({ message });
  }),
);

messageRouter.delete(
  "/:id/messages/:messageId",
  asyncHandler(async (req, res) => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!conversation || !canAccess(req.user, conversation)) throw new HttpError(404, "Conversation not found");
    await assertCreatorMessagingPermission(req.user, conversation);

    const message = await prisma.message.findFirst({
      where: {
        id: String(req.params.messageId),
        conversationId: conversation.id,
      },
    });
    if (!message) throw new HttpError(404, "Message not found");
    if (message.senderId !== req.user!.id) throw new HttpError(403, "You can only delete your own messages");

    if (message.mediaKey) {
      try {
        await deleteUpload(message.mediaKey);
      } catch {
        // File may already be missing
      }
    }

    await prisma.message.delete({ where: { id: message.id } });
    res.status(204).end();
  }),
);
