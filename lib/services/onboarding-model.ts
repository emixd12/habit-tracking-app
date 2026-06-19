import type {
  FirstRunOnboardingClientSnapshot,
  FirstRunOnboardingItem,
  FirstRunOnboardingModel,
  FirstRunOnboardingState,
} from "@/lib/types/onboarding";

export function resolveFirstRunOnboardingModel(
  state: FirstRunOnboardingState,
  client: FirstRunOnboardingClientSnapshot,
): FirstRunOnboardingModel {
  const items: FirstRunOnboardingItem[] = [
    {
      key: "behavior",
      label: "Create first behavior",
      statusLabel: state.hasAnyBehavior ? "Done" : "Start here",
      href: "/behaviors#create-behavior",
      actionLabel: state.hasAnyBehavior ? "Open behaviors" : "Create behavior",
      complete: state.hasAnyBehavior,
      optional: false,
    },
    {
      key: "notifications",
      label: "Browser reminders",
      statusLabel: notificationStatusLabel(client),
      href: "/settings#notifications",
      actionLabel: "Open settings",
      complete: notificationComplete(client),
      optional: false,
    },
    {
      key: "timezone",
      label: "Timezone",
      statusLabel: timezoneStatusLabel(state.timezone, client.browserTimezone),
      href: "/settings#timezone",
      actionLabel: "Review timezone",
      complete: timezoneComplete(state.timezone, client.browserTimezone),
      optional: false,
    },
    {
      key: "import",
      label: "Import existing records",
      statusLabel: state.hasImportRuns ? "Started" : "Optional",
      href: "/export#behaviorlog-import",
      actionLabel: "Open import",
      complete: state.hasImportRuns,
      optional: true,
    },
  ];
  const requiredComplete = items
    .filter((item) => !item.optional)
    .every((item) => item.complete);

  return {
    shouldRender: !client.dismissed && !requiredComplete,
    requiredComplete,
    items,
  };
}

function notificationComplete(
  client: FirstRunOnboardingClientSnapshot,
): boolean {
  if (client.notificationSupported === false) {
    return true;
  }

  return client.notificationPermission === "granted";
}

function notificationStatusLabel(
  client: FirstRunOnboardingClientSnapshot,
): string {
  if (client.notificationSupported === null) {
    return "Checking";
  }

  if (client.notificationSupported === false) {
    return "Unavailable";
  }

  switch (client.notificationPermission) {
    case "granted":
      return "Allowed";
    case "denied":
      return "Blocked";
    case "default":
      return "Not enabled";
    case "unavailable":
      return "Unavailable";
  }
}

function timezoneComplete(
  savedTimezone: string,
  browserTimezone: string | null,
): boolean {
  return browserTimezone === null || browserTimezone === savedTimezone;
}

function timezoneStatusLabel(
  savedTimezone: string,
  browserTimezone: string | null,
): string {
  if (browserTimezone === null) {
    return "Saved";
  }

  return browserTimezone === savedTimezone ? "Confirmed" : "Review";
}
