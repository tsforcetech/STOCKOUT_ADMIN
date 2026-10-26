import type { AdminSellerDocumentResponse, MarketplaceSellerDto } from "@/api/types/user-organization";

type SellerDocumentResponse = AdminSellerDocumentResponse;

/**
 * PA-1B.1 seller KYC: four mandatory document categories with explicit document types
 * (C# KycValidationHelper / MarketplaceSellerService). The server's `missingDocumentCategories` is the source of
 * truth for completeness; the mapping here drives the review panel (same catalogue as the seller portal).
 */
export type KycCategory = "TRADE_LICENSE" | "VAT" | "SIGNATORY" | "BANK";

export interface DocTypeOption {
  value: string;
  label: string;
}

export const TRADE_LICENSE_TYPES: DocTypeOption[] = [
  { value: "TRADE_LICENSE", label: "UAE trade licence" },
  { value: "COMMERCIAL_REGISTER", label: "Commercial register" },
];
export const VAT_REGISTERED_TYPES: DocTypeOption[] = [
  { value: "VAT_CERTIFICATE", label: "VAT certificate" },
  { value: "VAT_REGISTRATION_CERTIFICATE", label: "VAT registration certificate" },
  { value: "TAX_REGISTRATION_CERTIFICATE", label: "Tax registration certificate" },
  { value: "TRN_CERTIFICATE", label: "TRN certificate" },
];
export const VAT_DECLARATION_TYPES: DocTypeOption[] = [
  { value: "VAT_NON_REGISTRATION_DECLARATION", label: "Signed VAT non-registration declaration" },
  { value: "NON_VAT_DECLARATION", label: "Non-VAT declaration" },
  { value: "VAT_DECLARATION", label: "VAT declaration" },
];
export const SIGNATORY_ID_TYPES: DocTypeOption[] = [
  { value: "SIGNATORY_EMIRATES_ID", label: "Signatory Emirates ID" },
  { value: "SIGNATORY_PASSPORT", label: "Signatory passport" },
];
export const SIGNATORY_AUTHORITY_TYPES: DocTypeOption[] = [
  { value: "SIGNATORY_POA", label: "Power of attorney" },
  { value: "BOARD_RESOLUTION", label: "Board resolution" },
  { value: "MEMORANDUM_OF_ASSOCIATION", label: "Memorandum of association (MOA)" },
  { value: "ARTICLES_OF_ASSOCIATION", label: "Articles of association" },
];
/** One file holding both the ID and the authority proof — the uploader must declare what it contains. */
export const SIGNATORY_COMBINED_TYPES: DocTypeOption[] = [{ value: "SIGNATORY_POA_OR_PASSPORT", label: "Combined: ID and authority proof in one file" }];
export const BANK_TYPES: DocTypeOption[] = [
  { value: "BANK_IBAN_LETTER", label: "Bank letter with IBAN" },
  { value: "IBAN_CERTIFICATE", label: "IBAN certificate" },
  { value: "BANK_ACCOUNT_LETTER", label: "Bank account letter" },
];
export const OTHER_TYPES: DocTypeOption[] = [{ value: "OTHER", label: "Other supporting document" }];

export const COMBINED_TYPES = new Set(["SIGNATORY_POA_OR_PASSPORT", "SIGNATORY_COMBINED"]);
/** Generic VAT type kept on old records; reviewers must reclassify it. */
export const GENERIC_VAT_TYPE = "VAT_CERTIFICATE_OR_DECLARATION";

const SETS: Record<string, string[]> = {
  TRADE_LICENSE: ["TRADE_LICENSE", "TRADE_LICENCE", "COMMERCIAL_LICENSE", "COMMERCIAL_LICENCE", "COMMERCIAL_REGISTER"],
  VAT_REG: ["VAT_CERTIFICATE", "VAT_REGISTRATION_CERTIFICATE", "TAX_REGISTRATION_CERTIFICATE", "TRN_CERTIFICATE"],
  VAT_DECL: ["VAT_DECLARATION", "NON_VAT_DECLARATION", "VAT_NON_REGISTRATION_DECLARATION"],
  SIG_ID: ["SIGNATORY_EMIRATES_ID", "EMIRATES_ID", "SIGNATORY_PASSPORT", "PASSPORT"],
  SIG_AUTH: [
    "POWER_OF_ATTORNEY",
    "POA",
    "BOARD_RESOLUTION",
    "MOA_AOA",
    "MEMORANDUM_OF_ASSOCIATION",
    "ARTICLES_OF_ASSOCIATION",
    "COMMERCIAL_REGISTER_SIGNATORY",
    "PROOF_OF_AUTHORITY",
    "TRADE_LICENSE_SIGNATORY_PROOF",
    "SIGNATORY_POA",
    "SIGNATORY_POWER_OF_ATTORNEY",
  ],
  BANK: ["BANK_IBAN_LETTER", "BANK_LETTER", "IBAN_CERTIFICATE", "BANK_ACCOUNT_LETTER", "BANK_STATEMENT"],
};

const LABELS = new Map(
  [...TRADE_LICENSE_TYPES, ...VAT_REGISTERED_TYPES, ...VAT_DECLARATION_TYPES, ...SIGNATORY_ID_TYPES, ...SIGNATORY_AUTHORITY_TYPES, ...SIGNATORY_COMBINED_TYPES, ...BANK_TYPES, ...OTHER_TYPES].map(
    (o) => [o.value, o.label],
  ),
);
LABELS.set(GENERIC_VAT_TYPE, "VAT certificate or declaration");
LABELS.set("SIGNATORY_COMBINED", "Combined: ID and authority proof in one file");
LABELS.set("POWER_OF_ATTORNEY", "Power of attorney");

export function kycTypeLabel(type: string): string | undefined {
  return LABELS.get(type.toUpperCase());
}

export function categoryOf(type: string): KycCategory | null {
  const t = type.toUpperCase();
  if (SETS.TRADE_LICENSE.includes(t)) return "TRADE_LICENSE";
  if (t === GENERIC_VAT_TYPE || SETS.VAT_REG.includes(t) || SETS.VAT_DECL.includes(t)) return "VAT";
  if (COMBINED_TYPES.has(t) || SETS.SIG_ID.includes(t) || SETS.SIG_AUTH.includes(t)) return "SIGNATORY";
  if (SETS.BANK.includes(t)) return "BANK";
  return null;
}

/** Which signatory element(s) a document provides (declared on upload, or implied by its type). */
export function signatoryParts(d: Pick<SellerDocumentResponse, "documentType" | "containsSignatoryId" | "containsSignatoryAuthorityProof">) {
  const t = d.documentType.toUpperCase();
  if (COMBINED_TYPES.has(t)) return { id: d.containsSignatoryId === true, authority: d.containsSignatoryAuthorityProof === true };
  return { id: d.containsSignatoryId ?? SETS.SIG_ID.includes(t), authority: d.containsSignatoryAuthorityProof ?? SETS.SIG_AUTH.includes(t) };
}

export const isVatTypeAllowed = (type: string, vatRegistered: boolean) => (vatRegistered ? SETS.VAT_REG : SETS.VAT_DECL).includes(type.toUpperCase());

export interface CategoryStatus {
  key: KycCategory | "SIGNATORY_ID" | "SIGNATORY_AUTHORITY";
  title: string;
  hint: string;
  /** Server says it's still missing. */
  missing: boolean;
  docs: SellerDocumentResponse[];
  /** At least one document here was verified by a reviewer. */
  verified: boolean;
  rejected: boolean;
  /** A generic VAT document the reviewer still has to classify. */
  needsClassification?: boolean;
}

/** Per-category view for the checklist. Signatory is split into its two required parts. */
export function kycChecklist(seller: MarketplaceSellerDto, docs: SellerDocumentResponse[]): CategoryStatus[] {
  const missing = new Set((seller.missingDocumentCategories ?? []).map((c) => c.toUpperCase()));
  const live = docs.filter((d) => d.verificationStatus !== "REJECTED");
  const by = (pred: (d: SellerDocumentResponse) => boolean) => docs.filter(pred);
  const summarise = (list: SellerDocumentResponse[]) => ({
    docs: list,
    verified: list.some((d) => d.verificationStatus === "VERIFIED"),
    rejected: list.length > 0 && list.every((d) => d.verificationStatus === "REJECTED"),
  });
  const sig = by((d) => categoryOf(d.documentType) === "SIGNATORY");
  const sigMissing = missing.has("SIGNATORY_ID_AND_AUTHORITY");
  const vatDocs = by((d) => categoryOf(d.documentType) === "VAT");
  return [
    { key: "TRADE_LICENSE", title: "Trade licence", hint: "UAE trade licence or commercial register.", missing: missing.has("TRADE_LICENSE"), ...summarise(by((d) => categoryOf(d.documentType) === "TRADE_LICENSE")) },
    {
      key: "VAT",
      title: seller.isVatRegistered ? "VAT certificate" : "VAT non-registration declaration",
      hint: seller.isVatRegistered ? "Federal Tax Authority VAT / TRN certificate." : "Signed declaration that the business isn't VAT registered.",
      missing: missing.has("VAT_CERTIFICATE_OR_DECLARATION"),
      ...summarise(vatDocs),
      needsClassification: live.some((d) => d.documentType.toUpperCase() === GENERIC_VAT_TYPE),
    },
    {
      key: "SIGNATORY_ID",
      title: "Signatory identity",
      hint: "Emirates ID or passport of the authorised signatory.",
      missing: missing.has("SIGNATORY_IDENTITY") || (sigMissing && !live.some((d) => categoryOf(d.documentType) === "SIGNATORY" && signatoryParts(d).id)),
      ...summarise(sig.filter((d) => signatoryParts(d).id)),
    },
    {
      key: "SIGNATORY_AUTHORITY",
      title: "Signatory authority",
      hint: "Power of attorney, MOA or board resolution showing they can act for the company.",
      missing: missing.has("SIGNATORY_AUTHORITY_PROOF") || (sigMissing && !live.some((d) => categoryOf(d.documentType) === "SIGNATORY" && signatoryParts(d).authority)),
      ...summarise(sig.filter((d) => signatoryParts(d).authority)),
    },
    { key: "BANK", title: "Bank letter", hint: "Official bank letter or IBAN certificate.", missing: missing.has("BANK_IBAN_LETTER"), ...summarise(by((d) => categoryOf(d.documentType) === "BANK")) },
  ];
}

/** Licence expiry is required and must be in the future (DEC-011). */
export function licenceProblem(seller: MarketplaceSellerDto): string | null {
  if (!seller.tradeLicenseExpiresAtUtc) return "Add your trade licence expiry date in the business profile.";
  if (new Date(seller.tradeLicenseExpiresAtUtc).getTime() <= Date.now()) return "Your trade licence has expired. Renew it and update the dates in the business profile.";
  return null;
}
