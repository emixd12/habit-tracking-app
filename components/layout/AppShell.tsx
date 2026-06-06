"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Download,
  ListChecks,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { APP_NAV_ITEMS, type AppNavHref } from "@/lib/navigation";

const navIcons: Record<AppNavHref, LucideIcon> = {
  "/timeline": CalendarDays,
  "/behaviors": ListChecks,
  "/analytics": BarChart3,
  "/export": Download,
  "/settings": Settings,
};

export function AppShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b-2 border-foreground bg-background px-4 lg:hidden">
        <Link href="/timeline" className="text-lg font-bold">
          Cadence
        </Link>
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={isMobileOpen}
          onClick={() => setIsMobileOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center border-2 border-foreground bg-background text-foreground transition-colors hover:bg-surface"
        >
          <Menu aria-hidden="true" size={20} strokeWidth={2} />
        </button>
      </header>

      {isMobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-foreground/25 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      ) : null}

      <div className="lg:grid lg:min-h-dvh lg:grid-cols-[auto_1fr]">
        <aside
          className={[
            "fixed inset-y-0 left-0 z-50 flex w-72 -translate-x-full flex-col border-r-2 border-foreground bg-background transition-transform duration-200 lg:static lg:translate-x-0",
            isCollapsed ? "lg:w-[88px]" : "lg:w-72",
            isMobileOpen ? "translate-x-0" : "",
          ].join(" ")}
        >
          <div className="flex h-20 items-center justify-between border-b-2 border-foreground px-4">
            <Link
              href="/timeline"
              className={[
                "min-w-0 font-bold leading-tight",
                isCollapsed ? "lg:sr-only" : "",
              ].join(" ")}
              onClick={() => setIsMobileOpen(false)}
            >
              Cadence Tracker
            </Link>
            <button
              type="button"
              aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"}
              onClick={() => setIsCollapsed((value) => !value)}
              className="hidden h-10 w-10 shrink-0 items-center justify-center border-2 border-foreground bg-background text-foreground transition-colors hover:bg-surface lg:inline-flex"
            >
              {isCollapsed ? (
                <PanelLeftOpen aria-hidden="true" size={20} strokeWidth={2} />
              ) : (
                <PanelLeftClose aria-hidden="true" size={20} strokeWidth={2} />
              )}
            </button>
          </div>

          <nav aria-label="Primary" className="flex flex-1 flex-col gap-2 p-3">
            {APP_NAV_ITEMS.map((item) => {
              const Icon = navIcons[item.href];
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={isCollapsed ? item.label : undefined}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setIsMobileOpen(false)}
                  className={[
                    "group flex min-h-12 items-center gap-3 border-2 px-3 py-3 text-sm font-bold transition-colors",
                    isActive
                      ? "border-foreground bg-primary text-primary-foreground"
                      : "border-transparent bg-background text-foreground hover:border-foreground hover:bg-surface",
                    isCollapsed ? "lg:justify-center lg:px-0" : "",
                  ].join(" ")}
                >
                  <Icon aria-hidden="true" size={20} strokeWidth={2} />
                  <span className={isCollapsed ? "lg:sr-only" : ""}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div
            className={[
              "border-t-2 border-foreground p-4 text-sm leading-6 text-muted-readable",
              isCollapsed ? "lg:sr-only" : "",
            ].join(" ")}
          >
            Private behavior ledger.
          </div>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
