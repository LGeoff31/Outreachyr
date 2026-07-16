import { describe, expect, it, vi } from "vitest";

import {
  exchangeIdentityCode,
  GOOGLE_OAUTH_SCOPES,
  loginErrorMessage,
} from "./auth";

describe("Google app identity authentication", () => {
  it("requests identity scopes only", () => {
    expect(GOOGLE_OAUTH_SCOPES.split(/\s+/)).toEqual([
      "openid",
      "email",
      "profile",
    ]);
    expect(GOOGLE_OAUTH_SCOPES).not.toContain("gmail");
  });

  it("exchanges the callback code without requiring provider tokens", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { session: { access_token: "app-session" } },
      error: null,
    });
    await expect(
      exchangeIdentityCode({ exchangeCodeForSession }, "oauth-code")
    ).resolves.toEqual({
      session: { access_token: "app-session" },
      error: null,
    });
    expect(exchangeCodeForSession).toHaveBeenCalledOnce();
    expect(exchangeCodeForSession).toHaveBeenCalledWith("oauth-code");
  });

  it("keeps login errors about app identity rather than Gmail consent", () => {
    expect(loginErrorMessage("access_denied")).toBe(
      "Google sign-in was canceled."
    );
    expect(loginErrorMessage("gmail_token")).not.toContain("Gmail");
  });
});
