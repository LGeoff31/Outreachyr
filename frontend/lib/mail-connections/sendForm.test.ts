import { describe, expect, it } from "vitest";

import { appendMailConnectionId } from "./sendForm";

describe("appendMailConnectionId", () => {
  it("appends the exact connection field for a real send", () => {
    const data = new FormData();

    appendMailConnectionId(data, "connection-123", false);

    expect(data.get("mail_connection_id")).toBe("connection-123");
  });

  it("does not require a connection for recruiter preview", () => {
    const data = new FormData();

    appendMailConnectionId(data, null, true);

    expect(data.has("mail_connection_id")).toBe(false);
  });
});
