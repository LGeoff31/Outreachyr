import { describe, expect, it } from "vitest";

import { enabledMailProviders } from "./providers";

describe("enabledMailProviders", () => {
  it("renders only registry providers enabled by the backend", () => {
    expect(enabledMailProviders(["google", "unregistered"])).toEqual([
      expect.objectContaining({ id: "google" }),
    ]);
    expect(enabledMailProviders([])).toEqual([]);
  });
});
