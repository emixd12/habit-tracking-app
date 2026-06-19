"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Circle,
  Clock3,
  ListChecks,
  Upload,
  type LucideIcon,
} from "lucide-react";

import {
  getBrowserPushSupport,
  readNotificationPermission,
} from "@/lib/push/browser";
import { resolveFirstRunOnboardingModel } from "@/lib/services/onboarding-model";
import type {
  FirstRunOnboardingClientSnapshot,
  FirstRunOnboardingItemKey,
  FirstRunOnboardingState,
} from "@/lib/types/onboarding";

const STORAGE_KEY = "cadence-first-run-dismissed";

const itemIcons: Record<FirstRunOnboardingItemKey, LucideIcon> = {
  behavior: ListChecks,
  notifications: Bell,
  timezone: Clock3,
  import: Upload,
};

type FirstRunOnboardingPanelProps = Readonly<{
  onboarding: FirstRunOnboardingState;
}>;

export function FirstRunOnboardingPanel({
  onboarding,
}: FirstRunOnboardingPanelProps) {
  const [clientSnapshot, setClientSnapshot] =
    useState<FirstRunOnboardingClientSnapshot | null>(null);

  useEffect(() => {
    let isActive = true;
    const timeoutId = window.setTimeout(() => {
      if (!isActive) {
        return;
      }

      let dismissed = false;

      try {
        dismissed = window.localStorage.getItem(STORAGE_KEY) === "true";
      } catch {
        dismissed = false;
      }

      const support = getBrowserPushSupport(onboarding.vapidPublicKey);
      const browserTimezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || null;

      setClientSnapshot({
        dismissed,
        notificationPermission: readNotificationPermission(),
        notificationSupported: support.supported,
        browserTimezone,
      });
    }, 0);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [onboarding.vapidPublicKey]);

  if (!clientSnapshot) {
    return null;
  }

  const model = resolveFirstRunOnboardingModel(onboarding, clientSnapshot);

  if (!model.shouldRender) {
    return null;
  }

  return (
    <section
      aria-labelledby="first-run-onboarding-title"
      className="mb-8 border border-line bg-background p-5 pb-28 sm:p-6"
    >
      <div className="grid gap-4 border-b border-line pb-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div>
          <h2
            id="first-run-onboarding-title"
            className="text-xl leading-tight"
          >
            Set up Cadence
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-readable">
            Start with one behavior. The other steps use existing Settings and
            Export controls.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            try {
              window.localStorage.setItem(STORAGE_KEY, "true");
            } catch {
              // Local dismissal is a convenience; the app still works without it.
            }

            setClientSnapshot((current) =>
              current ? { ...current, dismissed: true } : current,
            );
          }}
          className="min-h-11 border border-line bg-background px-4 py-2 text-sm transition-colors hover:bg-surface"
        >
          Skip setup
        </button>
      </div>

      <ul className="divide-y divide-line border-b border-line">
        {model.items.map((item) => {
          const Icon = itemIcons[item.key];
          const StateIcon = item.complete ? CheckCircle2 : Circle;

          return (
            <li
              key={item.key}
              className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-3">
                <span className="flex h-8 w-8 items-center justify-center border border-line bg-surface">
                  <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-base leading-6 text-foreground">
                      {item.label}
                    </span>
                    <span className="inline-flex items-center gap-1 text-sm leading-5 text-muted-readable">
                      <StateIcon
                        aria-hidden="true"
                        className="h-3.5 w-3.5"
                        strokeWidth={2}
                      />
                      {item.statusLabel}
                    </span>
                  </div>
                  {item.optional ? (
                    <p className="mt-1 text-sm leading-6 text-muted-readable">
                      Use this only if you already have a BehaviorLog bundle.
                    </p>
                  ) : null}
                </div>
              </div>
              <Link
                href={item.href}
                className="inline-flex min-h-11 items-center justify-center border border-line bg-background px-4 py-2 text-sm transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                {item.actionLabel}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
