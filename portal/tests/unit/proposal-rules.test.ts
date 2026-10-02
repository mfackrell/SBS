import { describe, expect, it } from "vitest";
import { proposalCanBeAccepted } from "@/lib/proposals/rules";

const now = new Date("2026-10-02T12:00:00Z");

describe("proposal acceptance business rules", () => {
  it("allows sent and viewed proposals that have not expired", () => {
    expect(proposalCanBeAccepted({ status: "sent", expiresAt: null, now })).toBe(true);
    expect(
      proposalCanBeAccepted({
        status: "viewed",
        expiresAt: "2026-10-03T00:00:00Z",
        now,
      }),
    ).toBe(true);
  });

  it("rejects draft, accepted, declined, and expired workflow states", () => {
    for (const status of ["draft", "accepted", "declined", "expired"]) {
      expect(proposalCanBeAccepted({ status, expiresAt: null, now })).toBe(false);
    }
  });

  it("rejects a sent proposal after its expiration timestamp", () => {
    expect(
      proposalCanBeAccepted({
        status: "sent",
        expiresAt: "2026-10-01T23:59:59Z",
        now,
      }),
    ).toBe(false);
  });
});
