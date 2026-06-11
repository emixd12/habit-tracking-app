"use client";

import Link from "next/link";
import Image from "next/image";
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

function BrandMark() {
  return (
    <Image
      src="/brand/cadence-logo.png"
      alt=""
      aria-hidden="true"
      width={24}
      height={24}
      sizes="24px"
      className="h-6 w-6 shrink-0 object-cover"
    />
  );
}

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
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-line bg-background px-4 lg:hidden">
        <Link href="/timeline" className="inline-flex items-center gap-2 text-lg font-bold">
          <BrandMark />
          <span>Cadence</span>
        </Link>
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={isMobileOpen}
          onClick={() => setIsMobileOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center bg-background text-foreground transition-colors hover:bg-surface"
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

      <div>
        <aside
          className={[
            "fixed inset-y-0 left-0 z-50 flex w-64 -translate-x-full flex-col border-r border-line bg-background transition-[width,transform] duration-200 ease-out motion-reduce:transition-none lg:translate-x-0",
            isCollapsed ? "lg:w-14" : "lg:w-64",
            isMobileOpen ? "translate-x-0" : "",
          ].join(" ")}
        >
          <div
            className={[
              "flex h-20 items-center justify-between border-b border-line px-4",
              isCollapsed ? "lg:justify-center lg:px-0" : "",
            ].join(" ")}
          >
            <Link
              href="/timeline"
              className={[
                "inline-flex min-w-0 items-center gap-2 font-bold leading-tight",
                isCollapsed ? "lg:sr-only" : "",
              ].join(" ")}
              onClick={() => setIsMobileOpen(false)}
            >
              <BrandMark />
              <span className="min-w-0 truncate">Cadence</span>
            </Link>
            <button
              type="button"
              aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"}
              onClick={() => setIsCollapsed((value) => !value)}
              className="hidden h-10 w-10 shrink-0 items-center justify-center bg-background text-foreground transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:inline-flex"
            >
              {isCollapsed ? (
                <PanelLeftOpen aria-hidden="true" size={20} strokeWidth={2} />
              ) : (
                <PanelLeftClose aria-hidden="true" size={20} strokeWidth={2} />
              )}
            </button>
          </div>

          <nav
            aria-label="Primary"
            className={[
              "flex flex-1 flex-col gap-1 p-3",
              isCollapsed ? "lg:items-center lg:p-2 lg:px-1.5" : "",
            ].join(" ")}
          >
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
                    "group flex min-h-12 items-center gap-3 px-3 py-3 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                    isActive
                      ? "bg-[var(--primary)] text-primary-foreground"
                      : "bg-background text-foreground hover:bg-surface",
                    isCollapsed
                      ? "lg:h-10 lg:min-h-10 lg:w-10 lg:justify-center lg:px-0 lg:py-0"
                      : "",
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
              "border-t border-line p-4 text-sm leading-6 text-muted-readable",
              isCollapsed ? "lg:sr-only" : "",
            ].join(" ")}
          >
            Private behavior ledger.
          </div>
        </aside>

        <main
          className={[
            "min-w-0 transition-[padding] duration-200 ease-out motion-reduce:transition-none",
            isCollapsed ? "lg:pl-14" : "lg:pl-64",
          ].join(" ")}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
