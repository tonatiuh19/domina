import { describe, expect, it } from "vitest";
import { shouldSendLiveEmail } from "./index";

describe("outbound email policy", () => {
  it("blocks Resend during tests and for fixture domains", () => {
    expect(shouldSendLiveEmail("person@example.test")).toBe(false);
    expect(shouldSendLiveEmail("person@example.com")).toBe(false);
    expect(process.env.VITEST).toBe("true");
  });
});
