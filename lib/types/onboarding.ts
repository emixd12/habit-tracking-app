import type { BrowserNotificationPermission } from "@/lib/push/browser";

export type FirstRunOnboardingState = {
  hasAnyBehavior: boolean;
  hasImportRuns: boolean;
  timezone: string;
  vapidPublicKey: string;
};

export type FirstRunOnboardingClientSnapshot = {
  dismissed: boolean;
  notificationPermission: BrowserNotificationPermission;
  notificationSupported: boolean | null;
  browserTimezone: string | null;
};

export type FirstRunOnboardingItemKey =
  | "behavior"
  | "notifications"
  | "timezone"
  | "import";

export type FirstRunOnboardingItem = {
  key: FirstRunOnboardingItemKey;
  label: string;
  statusLabel: string;
  href: string;
  actionLabel: string;
  complete: boolean;
  optional: boolean;
};

export type FirstRunOnboardingModel = {
  shouldRender: boolean;
  requiredComplete: boolean;
  items: FirstRunOnboardingItem[];
};
