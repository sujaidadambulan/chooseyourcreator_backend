export const Roles = {
  BRAND: "BRAND",
  CREATOR: "CREATOR",
  ADMIN: "ADMIN",
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];

export const CampaignTypes = {
  PUBLIC: "PUBLIC",
  PRIVATE: "PRIVATE",
} as const;

export type CampaignType = (typeof CampaignTypes)[keyof typeof CampaignTypes];

export const CampaignStatuses = {
  DRAFT: "DRAFT",
  OPEN: "OPEN",
  CLOSED: "CLOSED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
} as const;

export type CampaignStatus = (typeof CampaignStatuses)[keyof typeof CampaignStatuses];

export const CollaborationStatuses = {
  APPLIED: "APPLIED",
  INVITED: "INVITED",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  WITHDRAWN: "WITHDRAWN",
  AGREEMENT_PENDING: "AGREEMENT_PENDING",
  PAYMENT_PENDING: "PAYMENT_PENDING",
  ACTIVE: "ACTIVE",
  CONTENT_SUBMITTED: "CONTENT_SUBMITTED",
  PAYMENT_REQUESTED: "PAYMENT_REQUESTED",
  COMPLETED: "COMPLETED",
  EXPIRED: "EXPIRED",
} as const;

export type CollaborationStatus =
  (typeof CollaborationStatuses)[keyof typeof CollaborationStatuses];

export const ApplicationStatuses = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  WITHDRAWN: "WITHDRAWN",
} as const;

export type ApplicationStatus =
  (typeof ApplicationStatuses)[keyof typeof ApplicationStatuses];

export const InvitationStatuses = {
  SENT: "SENT",
  VIEWED: "VIEWED",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
} as const;

export type InvitationStatus = (typeof InvitationStatuses)[keyof typeof InvitationStatuses];

export const AgreementStatuses = {
  DRAFT: "DRAFT",
  SENT: "SENT",
  VIEWED: "VIEWED",
  CREATOR_SIGNED: "CREATOR_SIGNED",
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  EXPIRED: "EXPIRED",
} as const;

export type AgreementStatus = (typeof AgreementStatuses)[keyof typeof AgreementStatuses];

export const PaymentTypes = {
  INITIAL_HELD: "INITIAL_HELD",
  PERFORMANCE_DIRECT: "PERFORMANCE_DIRECT",
} as const;

export type PaymentType = (typeof PaymentTypes)[keyof typeof PaymentTypes];

export const InitialPaymentStatuses = {
  PENDING: "PENDING",
  PAYMENT_SUBMITTED: "PAYMENT_SUBMITTED",
  HELD: "HELD",
  RELEASE_REQUESTED: "RELEASE_REQUESTED",
  RELEASE_AUTHORIZED: "RELEASE_AUTHORIZED",
  RELEASED: "RELEASED",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
} as const;

export type InitialPaymentStatus =
  (typeof InitialPaymentStatuses)[keyof typeof InitialPaymentStatuses];

export const PerformancePaymentStatuses = {
  PENDING: "PENDING",
  PAID_DIRECTLY: "PAID_DIRECTLY",
} as const;

export type PerformancePaymentStatus =
  (typeof PerformancePaymentStatuses)[keyof typeof PerformancePaymentStatuses];

export const SubmissionStatuses = {
  SUBMITTED: "SUBMITTED",
  APPROVED: "APPROVED",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
} as const;

export type SubmissionStatus =
  (typeof SubmissionStatuses)[keyof typeof SubmissionStatuses];

export const NICHES = [
  "Fitness",
  "Beauty",
  "Food",
  "Tech",
  "Fashion",
  "Travel",
  "Finance",
  "Lifestyle",
  "Gaming",
  "Education",
] as const;

export const PLATFORMS = ["Instagram", "YouTube", "Facebook", "Other"] as const;
export const ALL_PLATFORMS = ["Instagram", "YouTube", "Facebook", "Other"] as const;

export const EMPLOYEE_SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"] as const;

export const BRAND_ROLES = ["Founder", "Marketing", "Agency", "Other"] as const;

export const PRICE_RANGES = [
  { id: "under-10k", label: "Under ₹10k", minRupees: 0, maxRupees: 10000 },
  { id: "10k-20k", label: "₹10k – ₹20k", minRupees: 10000, maxRupees: 20000 },
  { id: "20k-50k", label: "₹20k – ₹50k", minRupees: 20000, maxRupees: 50000 },
  { id: "50k-1l", label: "₹50k – ₹1L", minRupees: 50000, maxRupees: 100000 },
  { id: "1l-plus", label: "₹1L+", minRupees: 100000, maxRupees: null },
] as const;

export function priceRangeLabel(id?: string | null, fallbackPaise?: number | null): string {
  const match = PRICE_RANGES.find((range) => range.id === id);
  if (match) return match.label;
  if (fallbackPaise != null) return formatInr(fallbackPaise);
  return "Price on request";
}

export const FOLLOWER_RANGES = [
  { id: "any", label: "Any followers", min: 0, max: null },
  { id: "under-5k", label: "Under 5K", min: 0, max: 5000 },
  { id: "5k-10k", label: "5K–10K", min: 5000, max: 10000 },
  { id: "10k-25k", label: "10K–25K", min: 10000, max: 25000 },
  { id: "25k-50k", label: "25K–50K", min: 25000, max: 50000 },
  { id: "50k-100k", label: "50K–100K", min: 50000, max: 100000 },
  { id: "above-100k", label: "Above 100K", min: 100000, max: null },
] as const;

export const FOLLOWER_ESTIMATES = FOLLOWER_RANGES.filter((range) => range.id !== "any");

export function followerEstimateId(count?: number | null): string {
  if (count == null) return FOLLOWER_ESTIMATES[0].id;
  const match = [...FOLLOWER_ESTIMATES].reverse().find((range) => count >= range.min && (range.max == null || count < range.max));
  return match?.id ?? "above-100k";
}

export function followerEstimateLabel(rangeId?: string | null, count?: number | null): string {
  const named = FOLLOWER_ESTIMATES.find((range) => range.id === rangeId);
  if (named) return named.label;
  const legacyMap: Record<string, string> = {
    "0-10k": "5K–10K",
    "10k-50k": "25K–50K",
    "50k-100k": "50K–100K",
    "100k+": "Above 100K",
  };
  if (rangeId && legacyMap[rangeId]) return legacyMap[rangeId];
  if (count == null) return "Not set";
  return FOLLOWER_ESTIMATES.find((range) => range.id === followerEstimateId(count))?.label ?? "Not set";
}

export function formatFollowerCount(count?: number | null): string {
  if (count == null || isNaN(count)) return "0";
  if (count >= 1_000_000) {
    const millions = count / 1_000_000;
    return `${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (count >= 1_000) {
    const thousands = count / 1_000;
    return `${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
  }
  return String(count);
}

export const EffectiveAgreementStatuses = {
  DRAFT: "DRAFT",
  AWAITING_SIGNATURE: "AWAITING_SIGNATURE",
  AWAITING_PAYMENT: "AWAITING_PAYMENT",
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
} as const;

export type EffectiveAgreementStatus =
  (typeof EffectiveAgreementStatuses)[keyof typeof EffectiveAgreementStatuses];

export function resolveEffectiveAgreementStatus(input: {
  agreementStatus?: string | null;
  collaborationStatus?: string | null;
  initialPaymentStatus?: string | null;
  campaignStatus?: string | null;
  campaignEndDate?: string | Date | null;
}): EffectiveAgreementStatus {
  if (input.campaignStatus === "CANCELLED") return "CANCELLED";
  if (
    input.campaignStatus === "EXPIRED" ||
    input.collaborationStatus === "EXPIRED" ||
    input.agreementStatus === "EXPIRED"
  ) {
    return "EXPIRED";
  }
  if (
    input.agreementStatus === "COMPLETED" ||
    input.collaborationStatus === "COMPLETED" ||
    input.initialPaymentStatus === "RELEASED"
  ) {
    return "COMPLETED";
  }
  if (!input.agreementStatus || input.agreementStatus === "DRAFT") {
    return "DRAFT";
  }
  if (input.agreementStatus === "SENT" || input.agreementStatus === "VIEWED") {
    return "AWAITING_SIGNATURE";
  }
  if (
    input.collaborationStatus === "PAYMENT_PENDING" ||
    input.agreementStatus === "CREATOR_SIGNED" ||
    (input.initialPaymentStatus && input.initialPaymentStatus === "PENDING")
  ) {
    return "AWAITING_PAYMENT";
  }
  if (
    input.agreementStatus === "ACTIVE" ||
    input.collaborationStatus === "ACTIVE" ||
    input.collaborationStatus === "CONTENT_SUBMITTED" ||
    input.collaborationStatus === "PAYMENT_REQUESTED" ||
    input.initialPaymentStatus === "HELD" ||
    input.initialPaymentStatus === "RELEASE_REQUESTED"
  ) {
    return "ACTIVE";
  }
  return "DRAFT";
}

export function effectiveAgreementStatusMeta(status: EffectiveAgreementStatus): {
  label: string;
  badgeClass: string;
  dotClass: string;
} {
  switch (status) {
    case "ACTIVE":
      return {
        label: "Active",
        badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-300",
        dotClass: "bg-emerald-500",
      };
    case "AWAITING_SIGNATURE":
      return {
        label: "Awaiting signature",
        badgeClass: "bg-amber-50 text-amber-800 border-amber-300",
        dotClass: "bg-amber-500",
      };
    case "AWAITING_PAYMENT":
      return {
        label: "Awaiting payment",
        badgeClass: "bg-amber-50 text-amber-800 border-amber-300",
        dotClass: "bg-amber-500",
      };
    case "COMPLETED":
      return {
        label: "Completed",
        badgeClass: "bg-blue-50 text-blue-800 border-blue-300",
        dotClass: "bg-blue-500",
      };
    case "EXPIRED":
      return {
        label: "Expired",
        badgeClass: "bg-rose-50 text-rose-800 border-rose-300",
        dotClass: "bg-rose-500",
      };
    case "CANCELLED":
      return {
        label: "Cancelled",
        badgeClass: "bg-neutral-100 text-neutral-700 border-neutral-300",
        dotClass: "bg-neutral-400",
      };
    case "DRAFT":
    default:
      return {
        label: "Draft",
        badgeClass: "bg-neutral-100 text-neutral-700 border-neutral-300",
        dotClass: "bg-neutral-400",
      };
  }
}

export const SLOT_OCCUPYING_STATUSES: CollaborationStatus[] = [
  "ACCEPTED",
  "AGREEMENT_PENDING",
  "PAYMENT_PENDING",
  "ACTIVE",
  "CONTENT_SUBMITTED",
  "PAYMENT_REQUESTED",
  "COMPLETED",
];

export type ReferenceKind = "brand" | "creator" | "campaign";

export function formatReferenceNumber(kind: ReferenceKind, n: number): string {
  const prefix = kind === "brand" ? "CR-B" : kind === "creator" ? "CR-C" : "CR-CMP";
  return `${prefix}-${String(n).padStart(5, "0")}`;
}

export function referenceMatchesQuery(formatted: string, rawNumber: number, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (formatted.toLowerCase().includes(q)) return true;
  const digits = q.replace(/\D/g, "");
  if (digits && String(rawNumber).includes(digits)) return true;
  return false;
}

export function formatInr(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function statusLabel(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizeIndianPhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "");
  const local = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(local)) return null;
  return `+91${local}`;
}

export const BRAND = {
  name: "ChooseYourCreator",
  tagline: "Creator–Brand Collaboration Platform",
  adminEmail: "admin@chooseyourcreator.in",
  logoPath: "/brand/handshake_crayon_vector.svg",
} as const;
