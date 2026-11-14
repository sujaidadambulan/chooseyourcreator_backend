import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { hashPassword } from "./auth.js";
import { prisma } from "./db.js";

const app = createApp();

let registerPhoneSeq = 9876500000;

beforeEach(async () => {
  registerPhoneSeq = 9876500000;
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.agreement.deleteMany();
  await prisma.collaboration.deleteMany();
  await prisma.application.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.phoneOtp.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.session.deleteMany();
  await prisma.creatorProfile.deleteMany();
  await prisma.brandProfile.deleteMany();
  await prisma.socialAccount.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function register(email: string, role: "BRAND" | "CREATOR") {
  registerPhoneSeq += 1;
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/register").send({
    email,
    phone: String(registerPhoneSeq),
    password: "Password123!",
    role,
  });
  expect(response.status).toBe(201);
  if (role === "CREATOR") {
    const user = await prisma.user.findUnique({ where: { email } });
    await prisma.socialAccount.create({
      data: {
        userId: user!.id,
        platform: "Instagram",
        providerId: `ig-${email}`,
        username: "aanya",
        displayName: "Aanya",
        profileUrl: "https://instagram.com/aanya",
        followers: 10000,
      },
    });
  }
  return agent;
}

const brandProfile = {
  companyName: "Northstar",
  websiteUrl: "https://northstar.example",
  niche: "Fitness",
  employeeSize: "11-50",
  role: "Marketing",
  businessDescription: "Training gear for home workouts.",
  socialLinks: { instagram: "https://instagram.com/northstar" },
};

const creatorProfile = {
  name: "Aanya Shah",
  bio: "Strength training and product films.",
  city: "Mumbai",
  niche: "Fitness",
  gpayUpi: "+919876543210",
  socialPlatforms: ["Instagram"],
  socialLinks: { instagram: "https://instagram.com/aanya" },
  followerCounts: { Instagram: 10000 },
  engagementRate: 4.2,
  pricing: 15000,
};

function futureCampaign(type: "PUBLIC" | "PRIVATE", end = "2099-01-02") {
  return {
    title: `${type} campaign`,
    productName: "Band Set",
    productDetails: "Resistance bands",
    description: "Show a workout with the bands.",
    campaignType: type,
    niche: "Fitness",
    platform: "Instagram",
    estimatedPrice: 25000,
    creatorSlots: 1,
    startDate: "2099-01-01",
    endDate: end,
    deliverables: "1 reel",
    requirements: "Include the product.",
    publish: true,
  };
}

describe("authentication", () => {
  it("registers, rejects duplicate emails, and rejects bad passwords", async () => {
    await register("brand@example.com", "BRAND");
    const duplicate = await request(app).post("/api/auth/register").send({
      email: "brand@example.com",
      phone: "9123456789",
      password: "Password123!",
      role: "BRAND",
    });
    expect(duplicate.status).toBe(409);

    const invalid = await request(app).post("/api/auth/login").send({
      email: "brand@example.com",
      password: "wrong-password",
    });
    expect(invalid.status).toBe(401);

    const hidden = await request(app).get("/api/brand/profile");
    expect(hidden.status).toBe(401);
  });

  it("sends and verifies a phone code", async () => {
    const sent = await request(app).post("/api/auth/phone/send").send({ phone: "9876543210" });
    expect(sent.status).toBe(200);
    expect(sent.body.devCode).toMatch(/^\d{6}$/);
    const verified = await request(app).post("/api/auth/phone/verify").send({
      phone: "9876543210",
      code: sent.body.devCode,
      role: "CREATOR",
    });
    expect(verified.status).toBe(200);
    expect(verified.body.user.role).toBe("CREATOR");
  });

  it("stops a creator from opening the brand area", async () => {
    const creator = await register("creator@example.com", "CREATOR");
    const response = await creator.post("/api/campaigns").send(futureCampaign("PUBLIC"));
    expect(response.status).toBe(403);
  });
});

describe("campaigns, agreements, and payments", () => {
  it("hides private campaigns and blocks expired applications", async () => {
    const brand = await register("owner@example.com", "BRAND");
    await brand.put("/api/brand/profile").send(brandProfile);
    const creator = await register("talent@example.com", "CREATOR");
    await creator.put("/api/creator/profile").send(creatorProfile);

    const publicCampaign = await brand.post("/api/campaigns").send(futureCampaign("PUBLIC"));
    const privateCampaign = await brand.post("/api/campaigns").send(futureCampaign("PRIVATE"));
    expect(publicCampaign.status).toBe(201);
    expect(privateCampaign.status).toBe(201);

    const list = await creator.get("/api/creator/campaigns");
    expect(list.body.campaigns.map((item: { id: string }) => item.id)).toContain(publicCampaign.body.campaign.id);
    expect(list.body.campaigns.map((item: { id: string }) => item.id)).not.toContain(privateCampaign.body.campaign.id);

    const hidden = await creator.get(`/api/campaigns/${privateCampaign.body.campaign.id}`);
    expect(hidden.status).toBe(404);

    const expired = await brand.post("/api/campaigns").send({
      ...futureCampaign("PUBLIC"),
      title: "Expired campaign",
      startDate: "2000-01-01",
      endDate: "2000-01-02",
    });
    const applyExpired = await creator.post(`/api/campaigns/${expired.body.campaign.id}/apply`).send({ message: "Hi" });
    expect(applyExpired.status).toBe(400);
  });

  it("runs the collaboration through signature, holding, and release", async () => {
    const brand = await register("pay-brand@example.com", "BRAND");
    await brand.put("/api/brand/profile").send(brandProfile);
    const creator = await register("pay-creator@example.com", "CREATOR");
    await creator.put("/api/creator/profile").send(creatorProfile);
    const outsider = await register("outsider@example.com", "CREATOR");
    await outsider.put("/api/creator/profile").send({ ...creatorProfile, name: "Other Creator" });

    const created = await brand.post("/api/campaigns").send(futureCampaign("PUBLIC"));
    const campaignId = created.body.campaign.id as string;
    const application = await creator.post(`/api/campaigns/${campaignId}/apply`).send({ message: "I can film this." });
    expect(application.status).toBe(201);
    const accepted = await brand.put(`/api/applications/${application.body.application.id}`).send({ status: "ACCEPTED" });
    expect(accepted.status).toBe(200);

    const me = await creator.get("/api/auth/me");
    const creatorProfileRow = await prisma.creatorProfile.findUnique({ where: { userId: me.body.user.id } });
    const agreement = await brand.post("/api/agreements").send({
      campaignId,
      creatorId: creatorProfileRow!.id,
      initialPayment: 25000,
      performanceAmount: 5000,
      performanceTerms: "Paid directly after the views are counted.",
      deliverables: "1 reel",
      contentRequirements: "Show the product in use.",
    });
    expect(agreement.status).toBe(201);
    const forbiddenPdf = await outsider.get(`/api/agreements/${agreement.body.agreement.id}/pdf`);
    expect({ status: forbiddenPdf.status, body: forbiddenPdf.body }).toEqual({
      status: 404,
      body: { error: "Agreement not found" },
    });

    const signed = await creator.post(`/api/agreements/${agreement.body.agreement.id}/sign`).send({
      signatureName: "Aanya Shah",
      consent: true,
    });
    expect(signed.body.agreement.status).toBe("ACTIVE");

    const payments = await brand.get("/api/payments");
    const initial = payments.body.payments.find((item: { type: string }) => item.type === "INITIAL_HELD");
    expect(initial.amount).toBe(2500000);
    expect(initial.currency).toBe("INR");
    const paid = await brand.post("/api/payments/initial").send({ paymentId: initial.id });
    expect(paid.body.payment.initialStatus).toBe("PAYMENT_SUBMITTED");

    await prisma.user.create({
      data: {
        email: "ops@example.com",
        phone: "+919000000001",
        passwordHash: await hashPassword("Password123!"),
        authProvider: "EMAIL",
        role: "ADMIN",
      },
    });
    const admin = request.agent(app);
    await admin.post("/api/auth/login").send({ email: "ops@example.com", password: "Password123!" });
    await admin.post(`/api/admin/payments/${initial.id}/confirm-deposit`);

    const outsiderRelease = await outsider.post(`/api/payments/${initial.id}/request-release`);
    expect(outsiderRelease.status).toBe(404);

    const submitted = await creator.post("/api/submissions").field("campaignId", campaignId).field("socialUrl", "https://instagram.com/p/example").field("notes", "Posted today");
    expect(submitted.status).toBe(201);
    await brand.post(`/api/submissions/${submitted.body.submission.id}/review`).send({ decision: "APPROVED" });
    const requested = await creator.post(`/api/payments/${initial.id}/request-release`);
    expect(requested.body.payment.initialStatus).toBe("RELEASE_REQUESTED");
    const authorized = await brand.post(`/api/payments/${initial.id}/release`);
    expect(authorized.body.payment.initialStatus).toBe("RELEASE_AUTHORIZED");
    const released = await admin.post(`/api/admin/payments/${initial.id}/confirm-disbursal`);
    expect(released.body.payment.initialStatus).toBe("RELEASED");

    const direct = payments.body.payments.find((item: { type: string }) => item.type === "PERFORMANCE_DIRECT");
    const marked = await brand.post(`/api/payments/${direct.id}/mark-direct`);
    expect(marked.body.payment.performanceStatus).toBe("PAID_DIRECTLY");
  });
});
