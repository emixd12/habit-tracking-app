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
  const canRequest = support?.supported === true && !isBusy;
  const statusLabel = permissionStatusLabel(permission);

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

      if (nextPermission !== "granted" && nextPermission !== "unavailable") {
        nextPermission = await requestNotificationPermission();
      }

      setPermission(nextPermission);

      if (nextPermission === "denied") {
        setSaveState("idle");
        setMessage(
          "Notifications are blocked in this browser. Allow them in Chrome site settings, then click Save subscription again.",
        );
        return;
      }

      if (nextPermission !== "granted") {
        setSaveState("idle");
        setMessage(
          "Notification permission was not changed. Click Save subscription again to request it.",
        );
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
    <section
      id="notifications"
      className="scroll-mt-20 border-y border-line bg-background py-5 sm:py-6 md:col-span-2"
    >
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
          className="product-action product-action-primary min-h-11 py-2 text-sm font-bold"
        >
          {isBusy ? "Saving..." : buttonLabel()}
        </button>
      </div>

      {message ? (
        <p
          className={[
            "mt-5 border-t border-line pt-3 text-sm leading-6",
            saveState === "error" ? "text-accent" : "text-muted-readable",
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

function buttonLabel(): string {
  return "Save subscription";
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
