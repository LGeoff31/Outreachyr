import { describe, expect, it } from "vitest";

import type { MailConnection } from "./types";
import {
  chooseMailConnectionId,
  usableMailConnections,
} from "./selectors";

function connection(
  overrides: Partial<MailConnection> & Pick<MailConnection, "id">
): MailConnection {
  const { id, ...rest } = overrides;
  return {
    id,
    provider: "google",
    email: `${id}@example.com`,
    display_name: null,
    status: "connected",
    capabilities: ["send_mail"],
    is_default: false,
    last_verified_at: null,
    last_error_code: null,
    ...rest,
  };
}

describe("mail connection selection", () => {
  it("uses the connected default before the first connected account", () => {
    const connections = [
      connection({ id: "first" }),
      connection({ id: "default", is_default: true }),
    ];

    expect(chooseMailConnectionId(connections, null, ["google"])).toBe(
      "default"
    );
  });

  it("keeps the current usable account across reloads", () => {
    const connections = [
      connection({ id: "default", is_default: true }),
      connection({ id: "selected" }),
    ];

    expect(chooseMailConnectionId(connections, "selected", ["google"])).toBe(
      "selected"
    );
  });

  it("ignores accounts that cannot send", () => {
    const connections = [
      connection({ id: "reconnect", status: "reconnect_required", is_default: true }),
      connection({ id: "missing-scope", capabilities: [] }),
      connection({ id: "disabled-provider", provider: "disabled" }),
      connection({ id: "usable" }),
    ];

    expect(
      usableMailConnections(connections, ["google"]).map(({ id }) => id)
    ).toEqual(["usable"]);
    expect(chooseMailConnectionId(connections, "reconnect", ["google"])).toBe(
      "usable"
    );
  });
});
