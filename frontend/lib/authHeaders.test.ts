import { describe, expect, it } from "vitest";

import { bearerAuthHeaders } from "./authHeaders";

describe("bearerAuthHeaders", () => {
  it("formats a Supabase access token for backend APIs", () => {
    expect(bearerAuthHeaders("session-token")).toEqual({
      Authorization: "Bearer session-token",
    });
  });
});
