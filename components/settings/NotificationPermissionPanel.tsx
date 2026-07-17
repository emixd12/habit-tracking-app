"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getBrowserPushSupport,
  readBrowserPushSubscriptionStatus,
  readNotificationPermission,
  registerBrowserPushSubscription,
  requestNotificationPermission,
  type BrowserNotificationPermission,
  type BrowserPushSupport,
  type BrowserPushSubscriptionStatus,
} from "@/lib/push/browser";

type NotificationPermissionPanelProps = Readonly<{
  vapidPublicKey: string;
}>;

type SaveState = "idle" | "saving" | "saved" | "error";
type DeviceNotificationStatus = "checking" | BrowserPushSubscriptionStatus;
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
  const [subscriptionStatus, setSubscriptionStatus] =
    useState<DeviceNotificationStatus>("checking");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let isActive = true;
    const timeoutId = window.setTimeout(() => {
      if (!isActive) {
        return;
      }

      void loadBrowserNotificationState();
    }, 0);

    async function loadBrowserNotificationState() {
      const currentSupport = getBrowserPushSupport(vapidPublicKey);
      const currentPermission = readNotificationPermission();
      const currentSubscriptionStatus = currentSupport.supported
        ? await readBrowserPushSubscriptionStatus(vapidPublicKey)
        : "unavailable";

      if (!isActive) {
        return;
      }

      setSupport(currentSupport);
      setPermission(currentPermission);
      setSubscriptionStatus(currentSubscriptionStatus);
    }

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
  const showAction = support?.supported === true && permission !== "denied";
  const canRequest = showAction && !isBusy;
  const notificationsEnabled =
    permission === "granted" && subscriptionStatus === "saved";
  const statusLabel = deviceNotificationStatusLabel({
    permission,
    subscriptionStatus,
    support,
  });

  async function handleEnable() {
    setSaveState("saving");
    setMessage("");

    try {
      const currentSupport = getBrowserPushSupport(vapidPublicKey);
      setSupport(currentSupport);

      if (!currentSupport.supported) {
        setPermission(readNotificationPermission());
        setSubscriptionStatus("unavailable");
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
        setSubscriptionStatus("missing");
        setSaveState("idle");
        setMessage(
          "Notifications are blocked in this browser. Allow them in browser settings, then return here.",
        );
        return;
      }

      if (nextPermission !== "granted") {
        setSubscriptionStatus("missing");
        setSaveState("idle");
        setMessage(
          "Notifications were not enabled. Click Enable notifications on this device to try again.",
        );
        return;
      }

      await registerBrowserPushSubscription(vapidPublicKey);
      setSubscriptionStatus("saved");
      setSaveState("saved");
      setMessage("Notifications are enabled on this device.");
    } catch (error) {
      setSubscriptionStatus("missing");
      setSaveState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Browser notifications could not be enabled.",
      );
    }
  }

  return (
    <section
      id="notifications"
      className="scroll-mt-20 bg-background py-5 sm:py-6"
    >
      <h2 className="text-xl leading-tight">Notifications</h2>
      <dl className="mt-4 grid gap-3 text-sm leading-6 text-muted-readable">
        <div>
          <dt className="font-bold text-foreground">Browser notifications</dt>
          <dd>{statusLabel}</dd>
        </div>
      </dl>

      {showAction ? (
        <button
          type="button"
          disabled={!canRequest}
          onClick={handleEnable}
          className="product-action product-action-primary mt-4 min-h-11 w-fit py-2 text-sm"
        >
          {isBusy ? "Saving..." : buttonLabel(notificationsEnabled)}
        </button>
      ) : null}

      {message || unavailableMessage ? (
        <p
          className={[
            "mt-5 text-sm leading-6",
            saveState === "error" ? "text-accent" : "text-muted-readable",
          ].join(" ")}
        >
          {message || unavailableMessage}
        </p>
      ) : null}
    </section>
  );
}

function deviceNotificationStatusLabel(input: {
  permission: BrowserNotificationPermission;
  subscriptionStatus: DeviceNotificationStatus;
  support: BrowserPushSupport | null;
}): string {
  if (input.support === null || input.subscriptionStatus === "checking") {
    return "Checking";
  }

  if (input.support.supported === false || input.permission === "unavailable") {
    return "Not supported on this device";
  }

  if (input.permission === "denied") {
    return "Blocked in this browser";
  }

  if (
    input.permission === "granted" &&
    input.subscriptionStatus === "saved"
  ) {
    return "Enabled on this device";
  }

  return "Not enabled on this device";
}

function buttonLabel(notificationsEnabled: boolean): string {
  return notificationsEnabled
    ? "Refresh this device"
    : "Enable notifications on this device";
}

function supportMessage(reason: BrowserPushUnavailableReason): string {
  switch (reason) {
    case "missing_public_key":
      return "Notifications are not configured.";
    case "notifications_unavailable":
      return "Notifications are not supported on this device.";
    case "service_worker_unavailable":
      return "Notifications are not supported on this device.";
    case "push_unavailable":
      return "Notifications are not supported on this device.";
  }
}
