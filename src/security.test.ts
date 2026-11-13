import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { hashPassword } from "./auth.js";
import { prisma } from "./db.js";

const app = createApp();

let registerPhoneSeq = 9876600000;

beforeEach(async () => {
  registerPhoneSeq = 9876600000;
  adminPhoneSeq = 9000000001;
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
  await prisma.emailOtp.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.performancePaymentRequest.deleteMany();
  await prisma.creatorReview.deleteMany();
  await prisma.session.deleteMany();
  await prisma.creatorProfile.deleteMany();
  await prisma.brandProfile.deleteMany();
  await prisma.socialAccount.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

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
  socialPlatforms: ["Instagram"],
  socialLinks: { instagram: "https://instagram.com/aanya" },
  followerCounts: { Instagram: 10000 },
  engagementRate: 4.2,
  pricing: 15000,
};

function futureCampaign() {
  return {
    title: "Public campaign",
    productName: "Band Set",
    productDetails: "Resistance bands",
    description: "Show a workout with the bands.",
    campaignType: "PUBLIC" as const,
    niche: "Fitness",
    platform: "Instagram",
    estimatedPrice: 25000,
    creatorSlots: 1,
    startDate: "2099-01-01",
    endDate: "2099-01-02",
    deliverables: "1 reel",
    requirements: "Include the product.",
    publish: true,
  };
}

async function registerUser(email: string, role: "BRAND" | "CREATOR") {
  registerPhoneSeq += 1;
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/register").send({
    email,
    phone: String(registerPhoneSeq),
    password: "Password123!",
    role,
  });
  expect(response.status).toBe(201);
  return { agent, response };
}

let adminPhoneSeq = 9000000001;

async function createAdminAgent(email = "admin-sec@example.com") {
  adminPhoneSeq += 1;
  await prisma.user.create({
    data: {
      email,
      phone: `+91${adminPhoneSeq}`,
      passwordHash: await hashPassword("Password123!"),
      authProvider: "EMAIL",
      role: "ADMIN",
    },
  });
  const agent = request.agent(app);
  const login = await agent.post("/api/auth/login").send({ email, password: "Password123!" });
  expect(login.status).toBe(200);
  return agent;
}

describe("Stage 1 security hardening", () => {
  it("rejects unauthenticated admin bootstrap", async () => {
    const response = await request(app).post("/api/admin/bootstrap").send({
      email: "new-admin@example.com",
      password: "Password123!",
    });
    expect([401, 403, 404]).toContain(response.status);
  });

  it("rejects public registration with ADMIN role", async () => {
    const response = await request(app).post("/api/auth/register").send({
      email: "fake-admin@example.com",
      phone: "9123456789",
      password: "Password123!",
      role: "ADMIN",
    });
    expect(response.status).toBe(400);
    const user = await prisma.user.findUnique({ where: { email: "fake-admin@example.com" } });
    expect(user).toBeNull();
  });

  it("blocks brand and creator from admin routes", async () => {
    const { agent: brandAgent } = await registerUser("brand-sec@example.com", "BRAND");
    await brandAgent.put("/api/brand/profile").send(brandProfile);
    const brandOverview = await brandAgent.get("/api/admin/overview");
    expect(brandOverview.status).toBe(403);

    const { agent: creatorAgent } = await registerUser("creator-sec@example.com", "CREATOR");
    await creatorAgent.put("/api/creator/profile").send(creatorProfile);
    const creatorOverview = await creatorAgent.get("/api/admin/overview");
    expect(creatorOverview.status).toBe(403);
  });

  it("allows admin login and access to admin overview", async () => {
    const admin = await createAdminAgent();
    const overview = await admin.get("/api/admin/overview");
    expect(overview.status).toBe(200);
    expect(overview.body.stats).toBeDefined();
  });

  it("does not allow arbitrary origins in CORS", async () => {
    const res = await request(app).get("/api/health").set("Origin", "https://unauthorized.example");
    expect(res.headers["access-control-allow-origin"]).not.toBe("https://unauthorized.example");
  });

  it("keeps phone OTP login working", async () => {
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

  it("restricts manual payment admin actions to admins", async () => {
    const { agent: brand } = await registerUser("pay-brand-sec@example.com", "BRAND");
    await brand.put("/api/brand/profile").send(brandProfile);
    const { agent: creator } = await registerUser("pay-creator-sec@example.com", "CREATOR");
    await creator.put("/api/creator/profile").send(creatorProfile);

    const created = await brand.post("/api/campaigns").send(futureCampaign());
    const campaignId = created.body.campaign.id as string;
    const application = await creator.post(`/api/campaigns/${campaignId}/apply`).send({ message: "Ready" });
    await brand.put(`/api/applications/${application.body.application.id}`).send({ status: "ACCEPTED" });

    const me = await creator.get("/api/auth/me");
    const creatorProfileRow = await prisma.creatorProfile.findUnique({ where: { userId: me.body.user.id } });
    const agreement = await brand.post("/api/agreements").send({
      campaignId,
      creatorId: creatorProfileRow!.id,
      initialPayment: 25000,
      performanceAmount: 5000,
      performanceTerms: "Paid directly after views.",
      deliverables: "1 reel",
      contentRequirements: "Show the product.",
    });
    await creator.post(`/api/agreements/${agreement.body.agreement.id}/sign`).send({
      signatureName: "Aanya Shah",
      consent: true,
    });

    const payments = await brand.get("/api/payments");
    const initial = payments.body.payments.find((item: { type: string }) => item.type === "INITIAL_HELD");
    await brand.post("/api/payments/initial").send({ paymentId: initial.id });
    expect(initial.initialStatus).toBeDefined();

    const brandConfirm = await brand.post(`/api/admin/payments/${initial.id}/confirm-deposit`);
    expect(brandConfirm.status).toBe(403);

    const creatorConfirm = await creator.post(`/api/admin/payments/${initial.id}/confirm-deposit`);
    expect(creatorConfirm.status).toBe(403);

    const admin = await createAdminAgent("admin-pay@example.com");
    const held = await admin.post(`/api/admin/payments/${initial.id}/confirm-deposit`);
    expect(held.status).toBe(200);
    expect(held.body.payment.initialStatus).toBe("HELD");

    const submitted = await creator.post("/api/submissions").field("campaignId", campaignId).field("socialUrl", "https://instagram.com/p/example");
    await brand.post(`/api/submissions/${submitted.body.submission.id}/review`).send({ decision: "APPROVED" });
    await creator.post(`/api/payments/${initial.id}/request-release`);
    await brand.post(`/api/payments/${initial.id}/release`);

    const brandDisburse = await brand.post(`/api/admin/payments/${initial.id}/confirm-disbursal`);
    expect(brandDisburse.status).toBe(403);

    const released = await admin.post(`/api/admin/payments/${initial.id}/confirm-disbursal`);
    expect(released.status).toBe(200);
    expect(released.body.payment.initialStatus).toBe("RELEASED");
  });
});
