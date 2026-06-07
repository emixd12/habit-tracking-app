export type AppNavHref =
  | "/timeline"
  | "/behaviors"
  | "/analytics"
  | "/export"
  | "/settings";

export type AppNavItem = {
  href: AppNavHref;
  label: string;
  description: string;
};

export const DEFAULT_APP_ROUTE: AppNavHref = "/timeline";

export const APP_NAV_ITEMS: AppNavItem[] = [
  {
    href: "/timeline",
    label: "Timeline",
    description: "Current occurrences and prior unresolved decisions",
  },
  {
    href: "/behaviors",
    label: "Behaviors",
    description: "Recurring behavior definitions",
  },
  {
    href: "/analytics",
    label: "Analytics",
    description: "Basic completion counts and adherence",
  },
  {
    href: "/export",
    label: "Export",
    description: "JSONL, CSV, backup, and summary outputs",
  },
  {
    href: "/settings",
    label: "Settings",
    description: "Timezone, notifications, and categories",
  },
];

export function isProtectedAppRoute(pathname: string) {
  return APP_NAV_ITEMS.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
