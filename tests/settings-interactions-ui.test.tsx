import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import {
  AccountDeletionPanel,
  type DeleteAccountAction,
} from "../components/settings/AccountDeletionPanel";
import {
  TrustAndLegalPanel,
} from "../components/settings/SettingsPanels";
import {
  TimezoneControl,
  TimezonePanel,
  type TimezoneUpdateAction,
} from "../components/settings/TimezonePanel";

const timezoneAction: TimezoneUpdateAction = async (state) => state;
const deleteAccountAction: DeleteAccountAction = async (state) => state;

describe("Settings interaction controls", () => {
  it("renders the timezone selector and its save interaction", () => {
    const html = renderToStaticMarkup(
      <TimezonePanel
        currentTimezone="America/New_York"
        updateTimezoneAction={timezoneAction}
      />,
    );

    expect(html).toContain('name="timezone"');
    expect(html).toContain("grid-cols-1");
    expect(html).toContain("min-w-0 w-full");
    expect(html).toContain(">Save timezone</button>");
  });

  it("keeps both timezone control variants within their grid track", () => {
    const selectHtml = renderToStaticMarkup(
      <TimezoneControl
        onValueChange={() => undefined}
        options={["America/New_York"]}
        useTextInput={false}
        value="America/New_York"
      />,
    );
    const inputHtml = renderToStaticMarkup(
      <TimezoneControl
        onValueChange={() => undefined}
        options={["America/New_York"]}
        useTextInput={true}
        value="America/New_York"
      />,
    );

    expect(selectHtml).toMatch(
      /<select[^>]*class="[^"]*min-w-0 w-full[^"]*"/,
    );
    expect(inputHtml).toMatch(
      /<input[^>]*class="[^"]*min-w-0 w-full[^"]*"/,
    );
  });

  it("renders separate Trust, Privacy, and Terms destinations", () => {
    const html = renderToStaticMarkup(<TrustAndLegalPanel />);

    expect(html).toContain('href="/trust"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
  });

  it("renders every account-deletion gate and the Export prerequisite", () => {
    const html = renderToStaticMarkup(
      <AccountDeletionPanel
        confirmationLabel="person@example.test"
        deleteAccountAction={deleteAccountAction}
      />,
    );

    expect(html).toContain('href="/export"');
    expect(html).toContain(">Open Export</a>");
    expect(html).toContain('name="confirm_export"');
    expect(html).toContain("I downloaded an export or do not need one.");
    expect(html).toContain('name="confirmation"');
    expect(html).toContain("Type person@example.test to confirm");
    expect(html).toContain(">Delete account</button>");
  });
});
