import {
  type AgreementStatus,
  type ApplicationStatus,
  type CampaignStatus,
  type CampaignType,
  type CollaborationStatus,
  type InitialPaymentStatus,
  type InvitationStatus,
  SLOT_OCCUPYING_STATUSES,
} from "./shared/index.js";

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

const campaignTransitions: Record<CampaignStatus, readonly CampaignStatus[]> = {
  DRAFT: ["OPEN", "CANCELLED"],
  OPEN: ["CLOSED", "EXPIRED", "CANCELLED"],
  CLOSED: [],
  EXPIRED: [],
  CANCELLED: [],
};

const collaborationTransitions: Record<CollaborationStatus, readonly CollaborationStatus[]> = {
  APPLIED: ["AGREEMENT_PENDING", "REJECTED", "WITHDRAWN", "EXPIRED"],
  INVITED: ["AGREEMENT_PENDING", "REJECTED", "EXPIRED"],
  ACCEPTED: ["AGREEMENT_PENDING"],
  REJECTED: ["APPLIED", "INVITED"],
  WITHDRAWN: ["APPLIED"],
  AGREEMENT_PENDING: ["PAYMENT_PENDING", "EXPIRED"],
  PAYMENT_PENDING: ["ACTIVE"],
  ACTIVE: ["CONTENT_SUBMITTED"],
  CONTENT_SUBMITTED: ["PAYMENT_REQUESTED", "ACTIVE"],
  PAYMENT_REQUESTED: ["COMPLETED"],
  COMPLETED: [],
  EXPIRED: [],
};

const applicationTransitions: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  PENDING: ["ACCEPTED", "REJECTED", "WITHDRAWN"],
  ACCEPTED: [],
  REJECTED: [],
  WITHDRAWN: ["PENDING"],
};

const invitationTransitions: Record<InvitationStatus, readonly InvitationStatus[]> = {
  SENT: ["VIEWED", "ACCEPTED", "REJECTED", "EXPIRED"],
  VIEWED: ["ACCEPTED", "REJECTED", "EXPIRED"],
  ACCEPTED: [],
  REJECTED: ["SENT"],
  EXPIRED: ["SENT"],
};

const agreementTransitions: Record<AgreementStatus, readonly AgreementStatus[]> = {
  DRAFT: ["SENT"],
  SENT: ["VIEWED", "CREATOR_SIGNED"],
  VIEWED: ["CREATOR_SIGNED"],
  CREATOR_SIGNED: ["ACTIVE"],
  ACTIVE: ["COMPLETED", "EXPIRED"],
  COMPLETED: [],
  EXPIRED: [],
};

const initialPaymentTransitions: Record<InitialPaymentStatus, readonly InitialPaymentStatus[]> = {
  PENDING: ["HELD", "PAYMENT_SUBMITTED", "FAILED"],
  PAYMENT_SUBMITTED: ["HELD", "FAILED", "PENDING"],
  HELD: ["RELEASE_REQUESTED", "REFUNDED"],
  RELEASE_REQUESTED: ["RELEASE_AUTHORIZED", "RELEASED", "FAILED"],
  RELEASE_AUTHORIZED: ["RELEASED", "FAILED", "RELEASE_REQUESTED"],
  RELEASED: [],
  FAILED: ["PENDING", "PAYMENT_SUBMITTED"],
  REFUNDED: [],
};

export function assertTransition<T extends string>(
  table: Record<T, readonly T[]>,
  from: T,
  to: T,
  label: string,
): void {
  if (from === to) return;
  if (!table[from]?.includes(to)) {
    throw new DomainError(`Cannot change ${label} from ${from} to ${to}`);
  }
}

export function assertCampaignTransition(from: CampaignStatus, to: CampaignStatus): void {
  assertTransition(campaignTransitions, from, to, "campaign");
}

export function assertCollaborationTransition(
  from: CollaborationStatus,
  to: CollaborationStatus,
): void {
  assertTransition(collaborationTransitions, from, to, "collaboration");
}

export function assertApplicationTransition(from: ApplicationStatus, to: ApplicationStatus): void {
  assertTransition(applicationTransitions, from, to, "application");
}

export function assertInvitationTransition(from: InvitationStatus, to: InvitationStatus): void {
  assertTransition(invitationTransitions, from, to, "invitation");
}

export function assertAgreementTransition(from: AgreementStatus, to: AgreementStatus): void {
  assertTransition(agreementTransitions, from, to, "agreement");
}

export function assertInitialPaymentTransition(
  from: InitialPaymentStatus,
  to: InitialPaymentStatus,
): void {
  assertTransition(initialPaymentTransitions, from, to, "payment");
}

export function campaignIsOpen(status: CampaignStatus, endDate: Date, now = new Date()): boolean {
  return status === "OPEN" && endDate.getTime() >= now.getTime();
}

export function applyEligibility(input: {
  campaignType: CampaignType;
  campaignStatus: CampaignStatus;
  endDate: Date;
  now?: Date;
  existingStatus?: ApplicationStatus | null;
}): { ok: true } | { ok: false; reason: string } {
  const now = input.now ?? new Date();
  if (input.campaignType !== "PUBLIC") {
    return { ok: false, reason: "This campaign is private" };
  }
  if (!campaignIsOpen(input.campaignStatus, input.endDate, now)) {
    return { ok: false, reason: "This campaign is not accepting applications" };
  }
  if (input.existingStatus === "PENDING" || input.existingStatus === "ACCEPTED") {
    return { ok: false, reason: "You already applied to this campaign" };
  }
  if (input.existingStatus === "REJECTED") {
    return { ok: false, reason: "Your application was not accepted" };
  }
  return { ok: true };
}

export function invitationAcceptEligibility(input: {
  campaignStatus: CampaignStatus;
  endDate: Date;
  invitationStatus: InvitationStatus;
  now?: Date;
}): { ok: true } | { ok: false; reason: string } {
  const now = input.now ?? new Date();
  if (!campaignIsOpen(input.campaignStatus, input.endDate, now)) {
    return { ok: false, reason: "This invitation has expired" };
  }
  if (input.invitationStatus === "ACCEPTED") {
    return { ok: false, reason: "Invitation already accepted" };
  }
  if (input.invitationStatus === "REJECTED" || input.invitationStatus === "EXPIRED") {
    return { ok: false, reason: "This invitation is no longer active" };
  }
  return { ok: true };
}

export function slotsRemaining(filled: number, slots: number): number {
  return Math.max(0, slots - filled);
}

export function canAcceptAnotherCreator(filled: number, slots: number): boolean {
  return filled < slots;
}

export function occupiesSlot(status: CollaborationStatus): boolean {
  return SLOT_OCCUPYING_STATUSES.includes(status);
}

export function canEditCampaign(status: CampaignStatus, activeCollaborations: number): boolean {
  return (status === "DRAFT" || status === "OPEN") && activeCollaborations === 0;
}

export function canReleaseInitialPayment(input: {
  paymentStatus: InitialPaymentStatus;
  submissionApproved: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (!input.submissionApproved) {
    return { ok: false, reason: "Payment can be requested after the brand approves the submission" };
  }
  if (input.paymentStatus !== "HELD") {
    return { ok: false, reason: "Only a held payment can be requested for release" };
  }
  return { ok: true };
}
