import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { ReminderEditor } from "../components/behaviors/ReminderEditor";

describe("ReminderEditor", () => {
  it("separates behavior reminder intent from device notification readiness", () => {
    const html = renderToStaticMarkup(
      <ReminderEditor
        browserReminderEnabled
        emailReminderEnabled={false}
        reminderOffsetMinutes={0}
      />,
    );

    expect(html).toContain("Browser reminders use devices");
    expect(html).toContain("enabled in Settings");
    expect(html).toContain("behavior is still tracked");
  });
});
