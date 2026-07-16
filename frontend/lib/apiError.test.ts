import { describe, expect, it } from "vitest";

import {
  apiErrorCode,
  apiErrorMessage,
  apiErrorRetryable,
} from "./apiError";

describe("provider-neutral API errors", () => {
  it("reads nested mail error envelopes", () => {
    const data = {
      error: {
        code: "mail_connection_reconnect_required",
        message: "Reconnect this sending account.",
        retryable: false,
      },
    };

    expect(apiErrorMessage(data, "", "Fallback")).toBe(
      "Reconnect this sending account."
    );
    expect(apiErrorCode(data)).toBe("mail_connection_reconnect_required");
    expect(apiErrorRetryable(data)).toBe(false);
  });

  it("preserves legacy flat error bodies", () => {
    const data = { code: "campaign_limit", error: "Campaign limit reached" };

    expect(apiErrorMessage(data, "", "Fallback")).toBe(
      "Campaign limit reached"
    );
    expect(apiErrorCode(data)).toBe("campaign_limit");
  });

  it("uses FastAPI detail text before the raw JSON response", () => {
    expect(
      apiErrorMessage(
        { detail: "Missing bearer token" },
        '{"detail":"Missing bearer token"}',
        "Fallback"
      )
    ).toBe("Missing bearer token");
  });
});
