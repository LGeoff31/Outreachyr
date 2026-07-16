import { describe, expect, it } from "vitest";

import { mailConnectionErrorGuidance } from "./errors";

describe("mail connection send guidance", () => {
  it("guides reconnect-required failures to Sending Accounts", () => {
    expect(
      mailConnectionErrorGuidance("mail_connection_reconnect_required")
    ).toEqual({
      message: "Reconnect this sending account, or choose another account.",
      manageAccounts: true,
    });
  });

  it("does not override unrelated API errors", () => {
    expect(mailConnectionErrorGuidance("campaign_limit")).toBeNull();
  });
});
