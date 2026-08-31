import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DesktopApp } from "../apps/desktop/src/desktop-app";
import { parseBehaviorReviewHref } from "../apps/desktop/src/behaviors-screen";
import { ReminderEditor } from "../components/behaviors/ReminderEditor";

describe("desktop UI adapters", () => {
  it("keeps unfinished screens visibly unavailable and exposes no cloud account actions", () => {
    const html = renderToStaticMarkup(
      <DesktopApp activeScreen="timeline" onNavigate={vi.fn()}>
        <h1>Local Timeline</h1>
      </DesktopApp>,
    );
    expect(html).toContain("Local Timeline");
    expect(html).toContain("Local profile");
    expect(html).toContain('aria-label="Export &amp; Import unavailable"');
    expect(html).toContain('aria-label="Settings unavailable"');
    expect(html.match(/disabled=""/g)).toHaveLength(4);
    expect(html).not.toContain("Sign out");
    expect(html).not.toContain("Google");
  });

  it("makes screens available only when their parent supplies availability", () => {
    const html = renderToStaticMarkup(
      <DesktopApp
        activeScreen="settings"
        onNavigate={vi.fn()}
        availableScreens={["timeline", "behaviors", "export", "settings"]}
      >
        <h1>Local Settings</h1>
      </DesktopApp>,
    );
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('aria-label="Settings"');
  });

  it("turns current behavior-review URLs into local selection data", () => {
    expect(
      parseBehaviorReviewHref(
        "/behaviors?range=90&behavior=morning%20walk&day=2026-08-30",
      ),
    ).toEqual({
      rangeDays: 90,
      selectedBehaviorId: "morning walk",
      selectedDayLocalDate: "2026-08-30",
    });
    expect(parseBehaviorReviewHref("/behaviors?range=invalid")).toEqual({
      rangeDays: undefined,
      selectedBehaviorId: undefined,
      selectedDayLocalDate: undefined,
    });
    expect(() =>
      parseBehaviorReviewHref("https://example.test/behaviors?range=30"),
    ).toThrow("Unsupported desktop");
  });

  it.each([true, false])(
    "preserves dormant email intent (%s) without an email control",
    (emailReminderEnabled) => {
      const html = renderToStaticMarkup(
        <ReminderEditor
          runtime="desktop"
          browserReminderEnabled
          emailReminderEnabled={emailReminderEnabled}
          reminderOffsetMinutes={0}
        />,
      );
      expect(html).toContain("Native reminders");
      expect(html).toContain(
        `type="hidden" name="email_reminder" value="${emailReminderEnabled ? "on" : ""}"`,
      );
      expect(html).not.toMatch(
        /<input(?=[^>]*type="checkbox")(?=[^>]*name="email_reminder")[^>]*>/,
      );
      expect(html).not.toContain("Browser notifications");
    },
  );

  it("leaves browser and email controls available in the default web runtime", () => {
    const html = renderToStaticMarkup(
      <ReminderEditor
        browserReminderEnabled
        emailReminderEnabled
        reminderOffsetMinutes={0}
      />,
    );
    expect(html).toContain("Browser notifications");
    expect(html).toContain("Email reminder");
    expect(html).toMatch(
      /<input(?=[^>]*type="checkbox")(?=[^>]*name="email_reminder")[^>]*>/,
    );
  });
});
