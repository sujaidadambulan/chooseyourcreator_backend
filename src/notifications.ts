import { prisma } from "./db.js";

export type NotificationType =
  | "INVITATION"
  | "APPLICATION"
  | "MESSAGE"
  | "AGREEMENT"
  | "SUBMISSION"
  | "PAYMENT"
  | "SYSTEM";

export interface CreateNotificationParams {
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  link?: string | null;
}

export async function createNotification(params: CreateNotificationParams) {
  try {
    return await prisma.notification.create({
      data: {
        userId: params.userId,
        title: params.title,
        message: params.message,
        type: params.type,
        link: params.link ?? null,
      },
    });
  } catch (error) {
    console.error("Error creating notification:", error);
    return null;
  }
}

export async function notifyCreator(
  creatorId: string,
  params: Omit<CreateNotificationParams, "userId">,
) {
  try {
    const creator = await prisma.creatorProfile.findUnique({
      where: { id: creatorId },
      select: { userId: true },
    });
    if (!creator?.userId) return null;
    return await createNotification({ ...params, userId: creator.userId });
  } catch (error) {
    console.error("Error notifying creator:", error);
    return null;
  }
}

export async function notifyBrand(
  brandId: string,
  params: Omit<CreateNotificationParams, "userId">,
) {
  try {
    const brand = await prisma.brandProfile.findUnique({
      where: { id: brandId },
      select: { userId: true },
    });
    if (!brand?.userId) return null;
    return await createNotification({ ...params, userId: brand.userId });
  } catch (error) {
    console.error("Error notifying brand:", error);
    return null;
  }
}
