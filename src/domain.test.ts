import { describe, expect, it } from "vitest";
import {
  applyEligibility,
  assertAgreementTransition,
  assertCampaignTransition,
  assertInitialPaymentTransition,
  assertInvitationTransition,
  canAcceptAnotherCreator,
  canReleaseInitialPayment,
  DomainError,
  invitationAcceptEligibility,
  slotsRemaining,
} from "./domain.js";

describe("campaign rules", () => {
  it("rejects applications to private or expired campaigns", () => {
    expect(applyEligibility({
      campaignType: "PRIVATE",
      campaignStatus: "OPEN",
      endDate: new Date(Date.now() + 86400000),
    })).toEqual({ ok: false, reason: "This campaign is private" });

    expect(applyEligibility({
      campaignType: "PUBLIC",
      campaignStatus: "EXPIRED",
      endDate: new Date(Date.now() - 1000),
    }).ok).toBe(false);
  });

  it("allows a new public application and blocks duplicates", () => {
    const endDate = new Date(Date.now() + 86400000);
    expect(applyEligibility({ campaignType: "PUBLIC", campaignStatus: "OPEN", endDate }).ok).toBe(true);
    expect(applyEligibility({ campaignType: "PUBLIC", campaignStatus: "OPEN", endDate, existingStatus: "PENDING" }).ok).toBe(false);
  });

  it("only allows valid campaign transitions", () => {
    expect(() => assertCampaignTransition("DRAFT", "OPEN")).not.toThrow();
    expect(() => assertCampaignTransition("EXPIRED", "OPEN")).toThrow(DomainError);
  });
});

describe("invitations and slots", () => {
  it("rejects an invitation after the campaign ends", () => {
    const decision = invitationAcceptEligibility({
      campaignStatus: "OPEN",
      endDate: new Date(Date.now() - 1000),
      invitationStatus: "SENT",
    });
    expect(decision.ok).toBe(false);
  });

  it("tracks remaining creator slots", () => {
    expect(canAcceptAnotherCreator(1, 2)).toBe(true);
    expect(canAcceptAnotherCreator(2, 2)).toBe(false);
    expect(slotsRemaining(2, 2)).toBe(0);
    expect(() => assertInvitationTransition("ACCEPTED", "REJECTED")).toThrow(DomainError);
  });
});

describe("payments and agreements", () => {
  it("releases a held payment only after approval", () => {
    expect(canReleaseInitialPayment({ paymentStatus: "HELD", submissionApproved: false }).ok).toBe(false);
    expect(canReleaseInitialPayment({ paymentStatus: "HELD", submissionApproved: true }).ok).toBe(true);
    expect(canReleaseInitialPayment({ paymentStatus: "PENDING", submissionApproved: true }).ok).toBe(false);
  });

  it("keeps initial payment transitions separate from performance payments", () => {
    expect(() => assertInitialPaymentTransition("PENDING", "HELD")).not.toThrow();
    expect(() => assertInitialPaymentTransition("HELD", "RELEASED")).toThrow(DomainError);
    expect(() => assertAgreementTransition("VIEWED", "CREATOR_SIGNED")).not.toThrow();
    expect(() => assertAgreementTransition("DRAFT", "ACTIVE")).toThrow(DomainError);
  });
});
