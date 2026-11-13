import { SLOT_OCCUPYING_STATUSES } from "./shared/index.js";
import { prisma } from "./db.js";

export async function expireDueCampaigns() {
  const now = new Date();
  const due = await prisma.campaign.findMany({
    where: { status: "OPEN", endDate: { lt: now } },
    select: { id: true },
  });
  if (due.length > 0) {
    const ids = due.map((item) => item.id);
    await prisma.$transaction([
      prisma.campaign.updateMany({ where: { id: { in: ids } }, data: { status: "EXPIRED" } }),
      prisma.invitation.updateMany({
        where: { campaignId: { in: ids }, status: { in: ["SENT", "VIEWED"] } },
        data: { status: "EXPIRED" },
      }),
      prisma.collaboration.updateMany({
        where: { campaignId: { in: ids }, status: { in: ["APPLIED", "INVITED", "AGREEMENT_PENDING"] } },
        data: { status: "EXPIRED" },
      }),
      prisma.agreement.updateMany({
        where: { campaignId: { in: ids }, status: { in: ["DRAFT", "SENT", "VIEWED"] } },
        data: { status: "EXPIRED" },
      }),
    ]);
  }

  // Also expire any agreements whose campaignEndDate has passed and not yet signed
  await prisma.agreement.updateMany({
    where: {
      status: { in: ["DRAFT", "SENT", "VIEWED"] },
      campaignEndDate: { lt: now },
    },
    data: { status: "EXPIRED" },
  });
}

export async function filledSlots(campaignId: string) {
  return prisma.collaboration.count({
    where: { campaignId, status: { in: SLOT_OCCUPYING_STATUSES } },
  });
}

export async function ensureConversation(campaignId: string, brandId: string, creatorId: string) {
  // Consolidate chat: 1 conversation between brand and creator across all campaigns
  const existing = await prisma.conversation.findFirst({
    where: { brandId, creatorId },
  });
  if (existing) {
    // Optionally update to latest campaignId so context reflects current active project
    if (existing.campaignId !== campaignId) {
      await prisma.conversation.update({
        where: { id: existing.id },
        data: { campaignId },
      });
    }
    return existing;
  }
  return prisma.conversation.create({
    data: { campaignId, brandId, creatorId },
  });
}

export const campaignInclude = {
  brand: { select: { id: true, companyName: true, companyLogo: true, niche: true, websiteUrl: true, businessDescription: true } },
} as const;
