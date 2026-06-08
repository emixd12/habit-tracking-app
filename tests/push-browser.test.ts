import { describe, expect, it } from "vitest";

import {
  getBrowserPushSupport,
  urlBase64ToUint8Array,
} from "../lib/push/browser";

describe("browser push helpers", () => {
  it("detects missing public VAPID configuration before browser support checks", () => {
    expect(getBrowserPushSupport(" ")).toEqual({
      supported: false,
      reason: "missing_public_key",
    });
  });

  it("reports notification support as unavailable outside the browser", () => {
    expect(getBrowserPushSupport("public-key")).toEqual({
      supported: false,
      reason: "notifications_unavailable",
    });
  });

  it("converts base64url VAPID keys into bytes", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID"))).toEqual([1, 2, 3]);
    expect(Array.from(urlBase64ToUint8Array("_w"))).toEqual([255]);
  });
});
