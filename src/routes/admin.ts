import { Router } from "express";
import { z } from "zod";
import { requireRole, requireUser } from "../auth.js";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import {
  paymentDepositVerifiedEmail,
  paymentDisbursalCompletedEmail,
  sendEmail,
} from "../email.js";
import { BRAND, formatInr, formatReferenceNumber, referenceMatchesQuery } from "../shared/index.js";

export const adminRouter = Router();

async function notifyPaymentVerificationEmails(
  payment: { campaignId: string; brandId: string; creatorId: string; amount: number },
  kind: "deposit" | "disbursal",
): Promise<void> {
  try {
    const [campaign, brand, creator] = await Promise.all([
      prisma.campaign.findUnique({ where: { id: payment.campaignId }, select: { title: true } }),
      prisma.brandProfile.findUnique({
        where: { id: payment.brandId },
        include: { user: { select: { email: true } } },
      }),
      prisma.creatorProfile.findUnique({
        where: { id: payment.creatorId },
        include: { user: { select: { email: true } } },
      }),
    ]);
    const payload = {
      campaignTitle: campaign?.title ?? "Campaign",
      brandName: brand?.companyName ?? "Brand",
      creatorName: creator?.name ?? "Creator",
      amountLabel: formatInr(payment.amount),
    };
    const html =
      kind === "deposit" ? paymentDepositVerifiedEmail(payload) : paymentDisbursalCompletedEmail(payload);
    const subject =
      kind === "deposit"
        ? `[${BRAND.name}] Payment deposit verified – ${payload.campaignTitle}`
        : `[${BRAND.name}] Payment released – ${payload.campaignTitle}`;

    const recipients = new Set<string>([BRAND.adminEmail]);
    if (brand?.user?.email) recipients.add(brand.user.email);
    if (creator?.user?.email) recipients.add(creator.user.email);

    await Promise.all(
      [...recipients].map((to) =>
        sendEmail({ to, subject, html }).catch((err) => {
          console.error(`Payment notification email failed for ${to}:`, err);
        }),
      ),
    );
  } catch (err) {
    console.error("Payment verification email error:", err);
  }
}

// Protect all admin endpoints with requireUser and requireRole("ADMIN")
adminRouter.use(requireUser, requireRole("ADMIN"));

adminRouter.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    const [
      totalUsers,
      totalBrands,
      totalCreators,
      totalCampaigns,
      openCampaigns,
      totalAgreements,
      activeAgreements,
      paymentsSummary,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "BRAND" } }),
      prisma.user.count({ where: { role: "CREATOR" } }),
      prisma.campaign.count(),
      prisma.campaign.count({ where: { status: "OPEN" } }),
      prisma.agreement.count(),
      prisma.agreement.count({ where: { status: { in: ["ACTIVE", "COMPLETED"] } } }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { initialStatus: { in: ["HELD", "RELEASED"] } },
      }),
    ]);

    res.json({
      stats: {
        totalUsers,
        totalBrands,
        totalCreators,
        totalCampaigns,
        openCampaigns,
        totalAgreements,
        activeAgreements,
        totalEscrowPaise: paymentsSummary._sum.amount ?? 0,
      },
    });
  }),
);

adminRouter.get(
  "/users",
  asyncHandler(async (req, res) => {
    const roleParam = typeof req.query.role === "string" ? req.query.role.toUpperCase() : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
    const verificationParam = typeof req.query.verification === "string" ? req.query.verification.toUpperCase() : undefined;
    const statusParam = typeof req.query.status === "string" ? req.query.status.toUpperCase() : undefined;

    const users = await prisma.user.findMany({
      where: {
        ...(roleParam && ["BRAND", "CREATOR", "ADMIN"].includes(roleParam)
          ? { role: roleParam as "BRAND" | "CREATOR" | "ADMIN" }
          : {}),
      },
      include: {
        brandProfile: true,
        creatorProfile: true,
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    let filtered = search
      ? users.filter((u) => {
          const emailMatch = u.email?.toLowerCase().includes(search);
          const phoneMatch = u.phone?.toLowerCase().includes(search);
          const brandMatch = u.brandProfile?.companyName.toLowerCase().includes(search);
          const creatorMatch = u.creatorProfile?.name.toLowerCase().includes(search);
          const brandRef =
            u.brandProfile?.referenceNumber != null &&
            referenceMatchesQuery(
              formatReferenceNumber("brand", u.brandProfile.referenceNumber),
              u.brandProfile.referenceNumber,
              search,
            );
          const creatorRef =
            u.creatorProfile?.referenceNumber != null &&
            referenceMatchesQuery(
              formatReferenceNumber("creator", u.creatorProfile.referenceNumber),
              u.creatorProfile.referenceNumber,
              search,
            );
          return emailMatch || phoneMatch || brandMatch || creatorMatch || brandRef || creatorRef;
        })
      : users;

    if (verificationParam === "VERIFIED") {
      filtered = filtered.filter(
        (u) => Boolean((u.brandProfile as { isVerified?: boolean } | null)?.isVerified || (u.creatorProfile as { isVerified?: boolean } | null)?.isVerified)
      );
    } else if (verificationParam === "UNVERIFIED") {
      filtered = filtered.filter(
        (u) => !((u.brandProfile as { isVerified?: boolean } | null)?.isVerified || (u.creatorProfile as { isVerified?: boolean } | null)?.isVerified)
      );
    }

    if (statusParam === "ACTIVE") {
      filtered = filtered.filter((u) => !(u as { isBlocked?: boolean }).isBlocked);
    } else if (statusParam === "BLOCKED") {
      filtered = filtered.filter((u) => Boolean((u as { isBlocked?: boolean }).isBlocked));
    }

    // Return users including private phone numbers ONLY to admin
    res.json({
      users: filtered.map((u) => ({
        id: u.id,
        email: u.email,
        phone: u.phone, // Shown exclusively in Admin portal
        role: u.role,
        authProvider: u.authProvider,
        isBlocked: Boolean((u as { isBlocked?: boolean }).isBlocked),
        createdAt: u.createdAt,
        brandProfile: u.brandProfile
          ? {
              id: u.brandProfile.id,
              referenceNumber: u.brandProfile.referenceNumber,
              companyName: u.brandProfile.companyName,
              companyLogo: u.brandProfile.companyLogo,
              bannerImage: u.brandProfile.bannerImage,
              websiteUrl: u.brandProfile.websiteUrl,
              niche: u.brandProfile.niche,
              employeeSize: u.brandProfile.employeeSize,
              role: u.brandProfile.role,
              businessDescription: u.brandProfile.businessDescription,
              socialLinks: u.brandProfile.socialLinks,
              onboardingComplete: u.brandProfile.onboardingComplete,
              isVerified: Boolean(u.brandProfile.isVerified),
            }
          : null,
        creatorProfile: u.creatorProfile
          ? {
              id: u.creatorProfile.id,
              referenceNumber: u.creatorProfile.referenceNumber,
              name: u.creatorProfile.name,
              profileImage: u.creatorProfile.profileImage,
              bannerImage: u.creatorProfile.bannerImage,
              city: u.creatorProfile.city,
              niche: u.creatorProfile.niche,
              bio: u.creatorProfile.bio,
              totalFollowers: u.creatorProfile.totalFollowers,
              socialPlatforms: u.creatorProfile.socialPlatforms,
              socialLinks: u.creatorProfile.socialLinks,
              followerCounts: u.creatorProfile.followerCounts,
              followerRanges: u.creatorProfile.followerRanges,
              onboardingComplete: u.creatorProfile.onboardingComplete,
              isVerified: Boolean(u.creatorProfile.isVerified),
            }
          : null,
      })),
    });
  }),
);

// Toggle verification badge for brand or creator
adminRouter.post(
  "/users/:id/verify",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: String(req.params.id) },
      include: { brandProfile: true, creatorProfile: true },
    });
    if (!user) throw new HttpError(404, "User not found");

    if (user.role === "BRAND" && user.brandProfile) {
      const updated = await prisma.brandProfile.update({
        where: { id: user.brandProfile.id },
        data: { isVerified: !user.brandProfile.isVerified },
      });
      res.json({ ok: true, isVerified: updated.isVerified });
      return;
    }

    if (user.role === "CREATOR" && user.creatorProfile) {
      const updated = await prisma.creatorProfile.update({
        where: { id: user.creatorProfile.id },
        data: { isVerified: !user.creatorProfile.isVerified },
      });
      res.json({ ok: true, isVerified: updated.isVerified });
      return;
    }

    throw new HttpError(400, "User profile not found for verification");
  }),
);

adminRouter.delete(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const targetId = String(req.params.id);
    if (targetId === req.user!.id) {
      throw new HttpError(400, "You cannot delete your own admin account");
    }
    const user = await prisma.user.findUnique({
      where: { id: targetId },
      include: { brandProfile: true, creatorProfile: true },
    });
    if (!user) throw new HttpError(404, "User not found");
    if (user.role === "ADMIN") throw new HttpError(400, "Cannot delete an admin user");

    try {
      await prisma.$transaction([
        prisma.message.deleteMany({ where: { senderId: user.id } }),
        prisma.session.deleteMany({ where: { userId: user.id } }),
        prisma.notification.deleteMany({ where: { userId: user.id } }),
        prisma.socialAccount.deleteMany({ where: { userId: user.id } }),
        prisma.passwordReset.deleteMany({ where: { userId: user.id } }),
        prisma.user.delete({ where: { id: user.id } }),
      ]);
    } catch {
      throw new HttpError(
        400,
        "Could not delete this account because of linked records. Try blocking the user instead.",
      );
    }

    res.json({ ok: true, message: "User deleted successfully." });
  }),
);

// Toggle block / unblock status for a user
adminRouter.post(
  "/users/:id/block",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!user) throw new HttpError(404, "User not found");
    if (user.role === "ADMIN") throw new HttpError(400, "Cannot block an admin user");

    const currentStatus = Boolean((user as { isBlocked?: boolean }).isBlocked);
    const updated = await (prisma.user as any).update({
      where: { id: user.id },
      data: { isBlocked: !currentStatus },
    });

    res.json({ ok: true, isBlocked: Boolean((updated as { isBlocked?: boolean }).isBlocked) });
  }),
);

// Fund Control System: Get pending offline payments and disbursements
adminRouter.get(
  "/payments",
  asyncHandler(async (_req, res) => {
    const payments = await prisma.payment.findMany({
      where: {
        type: "INITIAL_HELD",
      },
      include: {
        campaign: {
          select: {
            id: true,
            title: true,
            referenceNumber: true,
            brand: { select: { id: true, companyName: true, referenceNumber: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const creatorIds = [...new Set(payments.map((p) => p.creatorId))];
    const creators = await prisma.creatorProfile.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, name: true, referenceNumber: true },
    });

    res.json({
      payments: payments.map((p) => ({
        ...p,
        creator: creators.find((c) => c.id === p.creatorId) ?? null,
      })),
    });
  }),
);

// Admin verifies brand offline deposit -> Marks HELD, activates collaboration
adminRouter.post(
  "/payments/:id/confirm-deposit",
  asyncHandler(async (req, res) => {
    const payment = await prisma.payment.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!payment || payment.type !== "INITIAL_HELD") throw new HttpError(404, "Payment record not found");
    if (payment.initialStatus !== "PAYMENT_SUBMITTED" && payment.initialStatus !== "PENDING") {
      throw new HttpError(400, `Cannot confirm deposit for payment with status ${payment.initialStatus}`);
    }

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        initialStatus: "HELD",
        verifiedByAdminAt: new Date(),
      },
    });

    const collaboration = await prisma.collaboration.findUnique({
      where: { campaignId_creatorId: { campaignId: payment.campaignId, creatorId: payment.creatorId } },
    });
    if (collaboration && collaboration.status === "PAYMENT_PENDING") {
      await prisma.collaboration.update({
        where: { id: collaboration.id },
        data: { status: "ACTIVE" },
      });
    }

    void notifyPaymentVerificationEmails(payment, "deposit");

    res.json({ ok: true, payment: updated });
  }),
);

// Admin disburses funds to creator -> Marks RELEASED, completes collaboration
adminRouter.post(
  "/payments/:id/confirm-disbursal",
  asyncHandler(async (req, res) => {
    const payment = await prisma.payment.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!payment || payment.type !== "INITIAL_HELD") throw new HttpError(404, "Payment record not found");
    if (payment.initialStatus !== "RELEASE_AUTHORIZED" && payment.initialStatus !== "RELEASE_REQUESTED") {
      throw new HttpError(400, `Cannot disburse payment with status ${payment.initialStatus}`);
    }

    const collaboration = await prisma.collaboration.findUnique({
      where: { campaignId_creatorId: { campaignId: payment.campaignId, creatorId: payment.creatorId } },
    });
    const agreement = collaboration ? await prisma.agreement.findUnique({ where: { collaborationId: collaboration.id } }) : null;

    const [updated] = await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: {
          initialStatus: "RELEASED",
          disbursedByAdminAt: new Date(),
        },
      }),
      ...(collaboration
        ? [prisma.collaboration.update({ where: { id: collaboration.id }, data: { status: "COMPLETED" } })]
        : []),
      ...(agreement
        ? [prisma.agreement.update({ where: { id: agreement.id }, data: { status: "COMPLETED" as const } })]
        : []),
    ]);

    void notifyPaymentVerificationEmails(payment, "disbursal");

    res.json({ ok: true, payment: updated });
  }),
);

adminRouter.get(
  "/brands/:id",
  asyncHandler(async (req, res) => {
    const brand = await prisma.brandProfile.findUnique({
      where: { id: String(req.params.id) },
      include: { user: { select: { email: true, phone: true } } },
    });
    if (!brand) throw new HttpError(404, "Brand not found");
    res.json({
      brand: {
        ...brand,
        email: brand.user?.email ?? null,
        phone: brand.user?.phone ?? null,
      },
    });
  }),
);

adminRouter.get(
  "/creators/:id",
  asyncHandler(async (req, res) => {
    const creator = await prisma.creatorProfile.findUnique({
      where: { id: String(req.params.id) },
      include: { user: { select: { email: true, phone: true } } },
    });
    if (!creator) throw new HttpError(404, "Creator not found");
    res.json({
      creator: {
        ...creator,
        email: creator.user?.email ?? null,
        phone: creator.user?.phone ?? null,
      },
    });
  }),
);

adminRouter.get(
  "/campaigns",
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const campaigns = await prisma.campaign.findMany({
      include: {
        brand: {
          select: {
            id: true,
            referenceNumber: true,
            companyName: true,
            companyLogo: true,
            isVerified: true,
          },
        },
        _count: {
          select: {
            applications: true,
            collaborations: true,
            agreements: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const filtered = search
      ? campaigns.filter((c) => {
          const titleMatch = c.title.toLowerCase().includes(search.toLowerCase());
          const brandMatch = c.brand.companyName.toLowerCase().includes(search.toLowerCase());
          const refMatch = referenceMatchesQuery(
            formatReferenceNumber("campaign", c.referenceNumber),
            c.referenceNumber,
            search,
          );
          return titleMatch || brandMatch || refMatch;
        })
      : campaigns;

    res.json({ campaigns: filtered });
  }),
);

adminRouter.get(
  "/agreements",
  asyncHandler(async (req, res) => {
    const agreements = await prisma.agreement.findMany({
      include: {
        campaign: {
          select: {
            id: true,
            referenceNumber: true,
            title: true,
            brand: { select: { id: true, referenceNumber: true, companyName: true, companyLogo: true, isVerified: true } },
          },
        },
        collaboration: {
          select: {
            id: true,
            status: true,
            creator: {
              select: {
                id: true,
                referenceNumber: true,
                name: true,
                profileImage: true,
                niche: true,
                isVerified: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const filtered = search
      ? agreements.filter((a) => {
          const q = search.toLowerCase();
          if (a.campaign.title.toLowerCase().includes(q)) return true;
          if (a.campaign.brand.companyName.toLowerCase().includes(q)) return true;
          if (a.collaboration.creator.name.toLowerCase().includes(q)) return true;
          if (
            referenceMatchesQuery(
              formatReferenceNumber("campaign", a.campaign.referenceNumber),
              a.campaign.referenceNumber,
              search,
            )
          ) {
            return true;
          }
          if (
            referenceMatchesQuery(
              formatReferenceNumber("brand", a.campaign.brand.referenceNumber),
              a.campaign.brand.referenceNumber,
              search,
            )
          ) {
            return true;
          }
          if (
            a.collaboration.creator.referenceNumber != null &&
            referenceMatchesQuery(
              formatReferenceNumber("creator", a.collaboration.creator.referenceNumber),
              a.collaboration.creator.referenceNumber,
              search,
            )
          ) {
            return true;
          }
          return false;
        })
      : agreements;

    res.json({ agreements: filtered });
  }),
);

// Admin: inspect single campaign in full detail
adminRouter.get(
  "/campaigns/:id",
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.findUnique({
      where: { id: String(req.params.id) },
      include: {
        brand: true,
        applications: { include: { creator: true } },
        invitations: { include: { creator: true } },
        collaborations: {
          include: {
            creator: true,
            agreement: true,
            submissions: true,
          },
        },
        payments: true,
      },
    });
    if (!campaign) throw new HttpError(404, "Campaign not found");
    res.json({ campaign });
  }),
);

// Admin: inspect single agreement in full detail
adminRouter.get(
  "/agreements/:id",
  asyncHandler(async (req, res) => {
    const agreement = await prisma.agreement.findUnique({
      where: { id: String(req.params.id) },
      include: {
        campaign: { include: { brand: true } },
        collaboration: { include: { creator: true, submissions: true } },
        performancePaymentRequests: true,
      },
    });
    if (!agreement) throw new HttpError(404, "Agreement not found");
    res.json({ agreement });
  }),
);
