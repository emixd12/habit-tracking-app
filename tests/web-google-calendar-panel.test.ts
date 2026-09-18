import { describe, expect, it } from "vitest";

import { calendarCallbackMessage } from "@/components/settings/WebGoogleCalendarPanel";

describe("web Calendar callback messages", () => {
  it("maps callback codes to fixed same-account, consent, and reconnect guidance", () => {
    expect(calendarCallbackMessage("same_account_required")).toContain("same Google account");
    expect(calendarCallbackMessage("consent_denied")).toContain("permission was not granted");
    expect(calendarCallbackMessage("reconnect_required")).toContain("Reconnect");
  });

  it("does not render unrecognized callback text", () => {
    expect(calendarCallbackMessage("provider raw error")).toBeUndefined();
  });
});
