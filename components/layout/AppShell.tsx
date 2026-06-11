"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Download,
  ListChecks,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  X,
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

const SIDEBAR_STORAGE_KEY = "sidebar-open";
const DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";
const EDGE_SWIPE_WIDTH = 20;
const SWIPE_THRESHOLD = 48;
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type AppShellUser = {
  name?: string | null;
  email?: string | null;
};

type TouchGesture = {
  x: number;
  y: number;
  mode: "open" | "close";
};

function BrandMark({ className = "h-6 w-6" }: Readonly<{ className?: string }>) {
  return (
    <Image
      src="/brand/cadence-logo.png"
      alt=""
      aria-hidden="true"
      width={24}
      height={24}
      sizes="24px"
      className={["shrink-0 object-cover", className].join(" ")}
    />
  );
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute("disabled") && !element.getAttribute("aria-hidden"),
  );
}

function getAccountInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "C";
  }

  const first = parts[0]?.[0] ?? "C";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : undefined;

  return `${first}${second ?? ""}`.toUpperCase();
}

function PrimaryNav({
  pathname,
  isCollapsed,
  onNavigate,
}: Readonly<{
  pathname: string;
  isCollapsed: boolean;
  onNavigate?: () => void;
}>) {
  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 py-3">
      {APP_NAV_ITEMS.map((item) => {
        const Icon = navIcons[item.href];
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            title={isCollapsed ? item.label : undefined}
            aria-current={isActive ? "page" : undefined}
            onClick={onNavigate}
            className={[
              "group flex h-10 w-full items-center overflow-hidden text-sm transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              isCollapsed
                ? "text-muted-foreground"
                : isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
            ].join(" ")}
          >
            <span
              className={[
                "flex h-10 w-16 shrink-0 items-center justify-center transition-colors",
                isCollapsed
                  ? isActive
                    ? "bg-primary text-primary-foreground"
                    : "group-hover:bg-muted group-hover:text-foreground"
                  : "",
              ].join(" ")}
            >
              <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            </span>
            <span
              className={[
                "min-w-0 overflow-hidden whitespace-nowrap transition-opacity duration-200",
                isCollapsed
                  ? "w-0 opacity-0 pointer-events-none"
                  : "w-[calc(100%-4rem)] opacity-100",
              ].join(" ")}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function AccountTrigger({
  displayName,
  isCollapsed,
  onNavigate,
}: Readonly<{
  displayName: string;
  isCollapsed: boolean;
  onNavigate?: () => void;
}>) {
  return (
    <Link
      href="/settings"
      title={isCollapsed ? displayName : undefined}
      aria-label="Open account settings"
      onClick={onNavigate}
      className={[
        "group flex h-[60px] w-full items-center overflow-hidden text-sm transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        isCollapsed
          ? "text-muted-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      ].join(" ")}
    >
      <span
        className={[
          "flex h-[60px] w-16 shrink-0 items-center justify-center transition-colors",
          isCollapsed ? "group-hover:bg-muted group-hover:text-foreground" : "",
        ].join(" ")}
      >
        <span className="flex h-8 w-8 items-center justify-center border border-line bg-background text-xs text-foreground">
          {getAccountInitials(displayName)}
        </span>
      </span>
      <span
        className={[
          "min-w-0 overflow-hidden whitespace-nowrap transition-opacity duration-200",
          isCollapsed
            ? "w-0 opacity-0 pointer-events-none"
            : "w-[calc(100%-4rem)] opacity-100",
        ].join(" ")}
      >
        <span className="block truncate">{displayName}</span>
      </span>
    </Link>
  );
}

export function AppShell({
  children,
  user,
}: Readonly<{
  children: React.ReactNode;
  user?: AppShellUser;
}>) {
  const pathname = usePathname();
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  const hasStoredSidebarPreferenceRef = useRef(false);
  const touchGestureRef = useRef<TouchGesture | null>(null);

  const displayName = user?.name?.trim() || user?.email?.trim() || "Account";

  const closeMobileNav = useCallback(() => {
    setIsMobileOpen(false);
  }, []);

  const toggleDesktopSidebar = useCallback(() => {
    setIsDesktopSidebarOpen((current) => {
      const nextValue = !current;
      hasStoredSidebarPreferenceRef.current = true;

      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(nextValue));
      } catch {
        // Persistence is a convenience; the sidebar still works without it.
      }

      return nextValue;
    });
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);

    let storedValue: string | null = null;

    try {
      storedValue = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    } catch {
      storedValue = null;
    }

    const handleDesktopChange = (event: MediaQueryListEvent) => {
      if (!hasStoredSidebarPreferenceRef.current) {
        setIsDesktopSidebarOpen(event.matches);
      }
    };

    const frameId = window.requestAnimationFrame(() => {
      if (storedValue === "true" || storedValue === "false") {
        hasStoredSidebarPreferenceRef.current = true;
        setIsDesktopSidebarOpen(storedValue === "true");
      } else {
        setIsDesktopSidebarOpen(mediaQuery.matches);
      }
    });

    mediaQuery.addEventListener("change", handleDesktopChange);

    return () => {
      window.cancelAnimationFrame(frameId);
      mediaQuery.removeEventListener("change", handleDesktopChange);
    };
  }, []);

  useEffect(() => {
    if (!isMobileOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isMobileOpen]);

  useEffect(() => {
    if (!isMobileOpen) {
      return;
    }

    const previousElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    window.requestAnimationFrame(() => {
      const drawer = drawerRef.current;
      if (!drawer) {
        return;
      }

      const [firstFocusable] = getFocusableElements(drawer);
      (firstFocusable ?? drawer).focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMobileNav();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const drawer = drawerRef.current;
      if (!drawer) {
        return;
      }

      const focusableElements = getFocusableElements(drawer);

      if (focusableElements.length === 0) {
        event.preventDefault();
        drawer.focus({ preventScroll: true });
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (!drawer.contains(activeElement)) {
        event.preventDefault();
        firstElement.focus({ preventScroll: true });
        return;
      }

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus({ preventScroll: true });
        return;
      }

      if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousElement?.focus({ preventScroll: true });
    };
  }, [closeMobileNav, isMobileOpen]);

  useEffect(() => {
    const handleTouchStart = (event: TouchEvent) => {
      if (window.innerWidth >= 1024 || event.touches.length !== 1) {
        touchGestureRef.current = null;
        return;
      }

      const touch = event.touches[0];

      if (isMobileOpen) {
        touchGestureRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          mode: "close",
        };
        return;
      }

      touchGestureRef.current =
        touch.clientX <= EDGE_SWIPE_WIDTH
          ? {
              x: touch.clientX,
              y: touch.clientY,
              mode: "open",
            }
          : null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const gesture = touchGestureRef.current;
      const touch = event.touches[0];

      if (!gesture || !touch) {
        return;
      }

      const deltaX = touch.clientX - gesture.x;
      const deltaY = touch.clientY - gesture.y;
      const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY) * 1.2;

      if (!isHorizontalSwipe || Math.abs(deltaX) < SWIPE_THRESHOLD) {
        return;
      }

      if (gesture.mode === "open" && deltaX > 0) {
        setIsMobileOpen(true);
        touchGestureRef.current = null;
      }

      if (gesture.mode === "close" && deltaX < 0) {
        closeMobileNav();
        touchGestureRef.current = null;
      }
    };

    const handleTouchEnd = () => {
      touchGestureRef.current = null;
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [closeMobileNav, isMobileOpen]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 grid h-16 grid-cols-[minmax(0,1fr)_4rem] border-b border-line bg-card lg:hidden">
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={isMobileOpen}
          aria-controls="mobile-navigation"
          onClick={() => setIsMobileOpen(true)}
          className="grid h-16 min-w-0 grid-cols-[4rem_1fr] items-center text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span className="flex h-16 w-16 items-center justify-center">
            <BrandMark />
          </span>
          <span className="truncate text-lg">Cadence</span>
        </button>
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={isMobileOpen}
          aria-controls="mobile-navigation"
          onClick={() => setIsMobileOpen(true)}
          className="flex h-16 w-16 items-center justify-center transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Menu aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
        </button>
      </header>

      <div>
        <div
          aria-hidden="true"
          onClick={closeMobileNav}
          className={[
            "fixed inset-0 z-[70] bg-foreground/25 transition-opacity duration-200 ease-out motion-reduce:transition-none lg:hidden",
            isMobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
          ].join(" ")}
        />

        <aside
          id="mobile-navigation"
          ref={drawerRef}
          tabIndex={-1}
          aria-label="Mobile navigation"
          inert={!isMobileOpen ? true : undefined}
          className={[
            "fixed left-0 top-0 z-[80] flex h-screen w-[60vw] max-w-[60vw] flex-col overflow-hidden border-r border-line bg-card shadow-lg transition-transform duration-200 ease-out motion-reduce:transition-none lg:hidden",
            isMobileOpen ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
        >
          <div className="relative grid h-16 grid-cols-[4rem_1fr] items-center border-b border-line">
            <span className="flex h-16 w-16 items-center justify-center">
              <BrandMark />
            </span>
            <span className="min-w-0 truncate pr-12 text-lg">Cadence</span>
            <button
              type="button"
              aria-label="Close navigation"
              onClick={closeMobileNav}
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <X aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>

          <PrimaryNav pathname={pathname} isCollapsed={false} onNavigate={closeMobileNav} />

          <div className="border-t border-line">
            <AccountTrigger
              displayName={displayName}
              isCollapsed={false}
              onNavigate={closeMobileNav}
            />
          </div>
        </aside>

        <aside
          className={[
            "fixed inset-y-0 left-0 z-50 hidden flex-col overflow-hidden border-r border-line bg-card transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex",
            isDesktopSidebarOpen ? "w-64" : "w-16",
          ].join(" ")}
        >
          <div className="relative grid h-16 grid-cols-[4rem_1fr] items-center">
            <button
              type="button"
              aria-label={isDesktopSidebarOpen ? "Collapse navigation" : "Expand navigation"}
              aria-pressed={isDesktopSidebarOpen}
              onClick={toggleDesktopSidebar}
              className="group relative flex h-16 w-16 items-center justify-center transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <BrandMark
                className={[
                  "absolute h-6 w-6 transition-opacity duration-200",
                  isDesktopSidebarOpen ? "opacity-100" : "opacity-100 group-hover:opacity-0",
                ].join(" ")}
              />
              <PanelLeftOpen
                aria-hidden="true"
                className={[
                  "absolute h-4 w-4 transition-opacity duration-200",
                  isDesktopSidebarOpen ? "opacity-0" : "opacity-0 group-hover:opacity-100",
                ].join(" ")}
                strokeWidth={2}
              />
            </button>
            <div
              className={[
                "min-w-0 pr-12 transition-opacity duration-200",
                isDesktopSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0",
              ].join(" ")}
            >
              <span className="block truncate text-lg">Cadence</span>
            </div>
            {isDesktopSidebarOpen ? (
              <button
                type="button"
                aria-label="Collapse navigation"
                onClick={toggleDesktopSidebar}
                className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <PanelLeftClose
                  aria-hidden="true"
                  className="h-4 w-4"
                  strokeWidth={2}
                />
              </button>
            ) : null}
          </div>

          <PrimaryNav pathname={pathname} isCollapsed={!isDesktopSidebarOpen} />

          <div className="border-t border-line">
            <AccountTrigger
              displayName={displayName}
              isCollapsed={!isDesktopSidebarOpen}
            />
          </div>
        </aside>

        <main
          className={[
            "min-w-0 transition-[padding] duration-200 ease-out motion-reduce:transition-none",
            isDesktopSidebarOpen ? "lg:pl-64" : "lg:pl-16",
          ].join(" ")}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
