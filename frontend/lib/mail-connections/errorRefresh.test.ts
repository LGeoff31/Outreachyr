import { describe, expect, it, vi } from "vitest";

import { resolveMailConnectionSendError } from "./errors";

describe("resolveMailConnectionSendError", () => {
  it("reloads shared connections after a mailbox state-changing failure", async () => {
    const reload = vi.fn().mockResolvedValue(undefined);

    await expect(
      resolveMailConnectionSendError("mailbox_reauth_required", reload)
    ).resolves.toEqual({
      message: "Reconnect this sending account, or choose another account.",
      manageAccounts: true,
    });
    expect(reload).toHaveBeenCalledOnce();
  });
});
