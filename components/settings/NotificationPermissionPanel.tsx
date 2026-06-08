"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getBrowserPushSupport,
  readNotificationPermission,
  registerBrowserPushSubscription,
  requestNotificationPermission,
  type BrowserNotificationPermission,
  type BrowserPushSupport,
} from "@/lib/push/browser";

type NotificationPermissionPanelProps = Readonly<{
  vapidPublicKey: string;
}>;

type SaveState = "idle" | "saving" | "saved" | "error";
type BrowserPushUnavailableReason = Extract<
  BrowserPushSupport,
  { supported: false }
>["reason"];

export function NotificationPermissionPanel({
  vapidPublicKey,
}: NotificationPermissionPanelProps) {
  const [support, setSupport] = useState<BrowserPushSupport | null>(null);
  const [permission, setPermission] =
    useState<BrowserNotificationPermission>("unavailable");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let isActive = true;
    const timeoutId = window.setTimeout(() => {
      if (!isActive) {
        return;
      }

      setSupport(getBrowserPushSupport(vapidPublicKey));
      setPermission(readNotificationPermission());
    }, 0);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [vapidPublicKey]);

  const unavailableMessage = useMemo(
    () => (support?.supported === false ? supportMessage(support.reason) : ""),
    [support],
  );
  const isBusy = saveState === "saving";
  const isDenied = permission === "denied";
  const canRequest = support?.supported === true && !isDenied && !isBusy;
  const statusLabel =
    saveState === "saved" ? "Enabled" : permissionStatusLabel(permission);

  async function handleEnable() {
    setSaveState("saving");
    setMessage("");

    try {
      const currentSupport = getBrowserPushSupport(vapidPublicKey);
      setSupport(currentSupport);

      if (!currentSupport.supported) {
        setPermission(readNotificationPermission());
        setSaveState("idle");
        setMessage(supportMessage(currentSupport.reason));
        return;
      }

      let nextPermission = readNotificationPermission();

      if (nextPermission === "default") {
        nextPermission = await requestNotificationPermission();
      }

      setPermission(nextPermission);

      if (nextPermission === "denied") {
        setSaveState("idle");
        setMessage("Notifications are blocked in this browser.");
        return;
      }

      if (nextPermission !== "granted") {
        setSaveState("idle");
        setMessage("Notification permission was not changed.");
        return;
      }

      await registerBrowserPushSubscription(vapidPublicKey);
      setSaveState("saved");
      setMessage("Browser reminders are enabled on this browser.");
    } catch (error) {
      setSaveState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Browser reminders could not be enabled.",
      );
    }
  }

  return (
    <section className="border-2 border-foreground bg-background p-5 sm:p-6 md:col-span-2">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <h2 className="text-xl font-bold leading-tight">Notifications</h2>
          <dl className="mt-4 grid gap-3 text-sm leading-6 text-muted-readable sm:grid-cols-2">
            <div>
              <dt className="font-bold text-foreground">Permission</dt>
              <dd>{statusLabel}</dd>
            </div>
            <div>
              <dt className="font-bold text-foreground">Browser push</dt>
              <dd>
                {support?.supported
                  ? "Available"
                  : unavailableMessage || "Checking"}
              </dd>
            </div>
          </dl>
        </div>

        <button
          type="button"
          disabled={!canRequest}
          onClick={handleEnable}
          className="min-h-11 border-2 border-foreground bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-foreground disabled:bg-surface disabled:text-muted-readable"
        >
          {isBusy ? "Saving..." : buttonLabel(permission)}
        </button>
      </div>

      {message ? (
        <p
          className={[
            "mt-5 border-2 px-3 py-2 text-sm leading-6",
            saveState === "error"
              ? "border-accent text-accent"
              : "border-foreground text-muted-readable",
          ].join(" ")}
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}

function permissionStatusLabel(
  permission: BrowserNotificationPermission,
): string {
  switch (permission) {
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

function buttonLabel(permission: BrowserNotificationPermission): string {
  return permission === "granted"
    ? "Save subscription"
    : "Enable browser reminders";
}

function supportMessage(reason: BrowserPushUnavailableReason): string {
  switch (reason) {
    case "missing_public_key":
      return "Push setup is not configured.";
    case "notifications_unavailable":
      return "Notifications are unavailable.";
    case "service_worker_unavailable":
      return "Service workers are unavailable.";
    case "push_unavailable":
      return "Push subscriptions are unavailable.";
  }
}
