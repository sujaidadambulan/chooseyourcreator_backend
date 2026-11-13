import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { requireUser } from "../auth.js";
import { prisma } from "../db.js";
import { safeUploadPath } from "../files.js";
import { asyncHandler, HttpError } from "../http.js";

export const fileRouter = Router();

const types: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".gif": "image/gif",
};

fileRouter.get(
  "/*",
  requireUser,
  asyncHandler(async (req, res) => {
    const key = String(req.params[0] ?? "");
    if (!key || key.includes("..")) throw new HttpError(400, "Invalid file");
    if (key.startsWith("profiles/")) {
      // Signed-in marketplace users can view profile images.
    } else if (key.startsWith("agreements/")) {
      const agreementId = key.split("/")[1];
      const agreement = await prisma.agreement.findUnique({ where: { id: agreementId } });
      const allowed =
        agreement &&
        (agreement.brandId === req.user?.brandProfile?.id || agreement.creatorId === req.user?.creatorProfile?.id);
      if (!allowed) throw new HttpError(404, "File not found");
    } else if (key.startsWith("submissions/")) {
      const collaborationId = key.split("/")[1];
      const collaboration = await prisma.collaboration.findUnique({
        where: { id: collaborationId },
        include: { campaign: true },
      });
      const allowed =
        collaboration &&
        (collaboration.campaign.brandId === req.user?.brandProfile?.id ||
          collaboration.creatorId === req.user?.creatorProfile?.id);
      if (!allowed) throw new HttpError(404, "File not found");
    } else if (key.startsWith("messages/")) {
      const conversationId = key.split("/")[1];
      const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
      const allowed =
        conversation &&
        (conversation.brandId === req.user?.brandProfile?.id ||
          conversation.creatorId === req.user?.creatorProfile?.id);
      if (!allowed) throw new HttpError(404, "File not found");
    } else {
      throw new HttpError(404, "File not found");
    }
    const full = safeUploadPath(key);
    if (!fs.existsSync(full)) throw new HttpError(404, "File not found");
    const ext = path.extname(full).toLowerCase();
    res.setHeader("Content-Type", types[ext] ?? "application/octet-stream");
    fs.createReadStream(full).pipe(res);
  }),
);
