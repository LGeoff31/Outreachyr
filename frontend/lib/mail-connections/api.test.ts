import { describe, expect, it } from "vitest";

import { parseMailConnectionsPayload } from "./api";

describe("mail connections API payloads", () => {
  const googleConnection = {
    id: "connection-1",
    provider: "google",
    email: "sender@example.com",
    display_name: "Sender",
    status: "connected",
    capabilities: ["send_mail"],
    is_default: true,
    last_verified_at: "2026-07-15T10:00:00Z",
    last_error_code: null,
  };

  it("keeps the backend wire shape and enabled provider ids", () => {
    expect(
      parseMailConnectionsPayload({
        connections: [googleConnection],
        providers: ["google"],
      })
    ).toEqual({ connections: [googleConnection], providers: ["google"] });
  });

  it("offers no providers when the backend omits capability discovery", () => {
    expect(parseMailConnectionsPayload({ connections: [] })).toEqual({
      connections: [],
      providers: [],
    });
  });
});
