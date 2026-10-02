import { describe, expect, it } from "vitest";
import { billingProfileUpdateSchema } from "@/lib/contracts/billing";
import { documentUploadIntentSchema } from "@/lib/contracts/documents";
import { profileUpdateSchema } from "@/lib/contracts/profile";
import { proposalDraftSchema } from "@/lib/contracts/proposals";

describe("validation schemas", () => {
  it("requires HTTPS for client-visible QuickBooks links", () => {
    const invalid = billingProfileUpdateSchema.safeParse({
      orgId: "11111111-1111-4111-8111-111111111111",
      qboCustomerRef: "QBO-100",
      qboPortalUrl: "http://example.com/billing",
      notes: "",
    });

    expect(invalid.success).toBe(false);

    const valid = billingProfileUpdateSchema.safeParse({
      orgId: "11111111-1111-4111-8111-111111111111",
      qboCustomerRef: "QBO-100",
      qboPortalUrl: "https://example.com/billing",
      notes: "",
    });

    expect(valid.success).toBe(true);
  });

  it("rejects unsupported document MIME types", () => {
    const result = documentUploadIntentSchema.safeParse({
      orgId: "11111111-1111-4111-8111-111111111111",
      requestId: null,
      category: "client_upload",
      fileName: "payload.exe",
      mimeType: "application/octet-stream",
      sizeBytes: 100,
      replacesDocumentId: null,
    });

    expect(result.success).toBe(false);
  });

  it("requires a real profile name", () => {
    expect(profileUpdateSchema.safeParse({ fullName: "A", phone: "" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ fullName: "Alex Smith", phone: "" }).success).toBe(true);
  });

  it("requires at least one proposal line item", () => {
    const result = proposalDraftSchema.safeParse({
      proposalId: "11111111-1111-4111-8111-111111111111",
      title: "Accounting Services Proposal",
      currency: "USD",
      termsText: "",
      expiresOn: null,
      lineItems: [],
    });

    expect(result.success).toBe(false);
  });
});
