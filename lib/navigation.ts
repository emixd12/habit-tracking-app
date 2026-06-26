export type AppNavHref =
  | "/timeline"
  | "/behaviors"
  | "/export"
  | "/settings";

export type ProtectedAppHref = AppNavHref | "/analytics";

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
    description: "Behavior settings, adherence, and dated review",
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

const PROTECTED_APP_ROUTES: ProtectedAppHref[] = [
  ...APP_NAV_ITEMS.map((item) => item.href),
  "/analytics",
];

export function isProtectedAppRoute(pathname: string) {
  return PROTECTED_APP_ROUTES.some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
}
