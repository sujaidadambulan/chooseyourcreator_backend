import { Router } from "express";
import { prisma } from "../db.js";
import { requireUser } from "../auth.js";
import { asyncHandler } from "../http.js";

export const notificationRouter = Router();

notificationRouter.use(requireUser);

notificationRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.notification.count({
        where: { userId, read: false },
      }),
    ]);

    res.json({ notifications, unreadCount });
  }),
);

notificationRouter.patch(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;

    const notification = await prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true },
    });

    const unreadCount = await prisma.notification.count({
      where: { userId, read: false },
    });

    res.json({ notification: updated, unreadCount });
  }),
);

notificationRouter.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const result = await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

    res.json({ success: true, count: result.count, unreadCount: 0 });
  }),
);
