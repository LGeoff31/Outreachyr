import { describe, expect, it } from "vitest";

import { mailConnectionCallbackErrorMessage } from "./errors";

describe("mail connection callback errors", () => {
  it("describes provider consent cancellation using the backend error code", () => {
    expect(
      mailConnectionCallbackErrorMessage("mailbox_permission_denied")
    ).toBe("Mailbox authorization was canceled.");
  });
});
