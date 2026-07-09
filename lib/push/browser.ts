export type BrowserPushSupport =
  | { supported: true }
  | {
      supported: false;
      reason:
        | "missing_public_key"
        | "notifications_unavailable"
        | "service_worker_unavailable"
        | "push_unavailable";
    };

export type BrowserNotificationPermission =
  | NotificationPermission
  | "unavailable";

export type BrowserPushSubscriptionStatus =
  | "saved"
  | "missing"
  | "unavailable";

export function getBrowserPushSupport(
  vapidPublicKey: string,
): BrowserPushSupport {
  if (!vapidPublicKey.trim()) {
    return {
      supported: false,
      reason: "missing_public_key",
    };
  }

  if (typeof window === "undefined" || !("Notification" in window)) {
    return {
      supported: false,
      reason: "notifications_unavailable",
    };
  }

  if (!("serviceWorker" in navigator)) {
    return {
      supported: false,
      reason: "service_worker_unavailable",
    };
  }

  if (!("PushManager" in window)) {
    return {
      supported: false,
      reason: "push_unavailable",
    };
  }

  return { supported: true };
}

export function readNotificationPermission(): BrowserNotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unavailable";
  }

  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  return Notification.requestPermission();
}

export async function readBrowserPushSubscriptionStatus(
  vapidPublicKey: string,
): Promise<BrowserPushSubscriptionStatus> {
  const support = getBrowserPushSupport(vapidPublicKey);

  if (!support.supported) {
    return "unavailable";
  }

  if (Notification.permission !== "granted") {
    return "missing";
  }

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();

  return subscription ? "saved" : "missing";
}

export async function registerBrowserPushSubscription(
  vapidPublicKey: string,
): Promise<void> {
  const support = getBrowserPushSupport(vapidPublicKey);

  if (!support.supported) {
    throw new Error("Browser notifications are unavailable.");
  }

  if (Notification.permission !== "granted") {
    throw new Error("Notification permission is not granted.");
  }

  const registration = await navigator.serviceWorker.register(
    "/push-service-worker.js",
  );
  const activeRegistration = await navigator.serviceWorker.ready;
  const pushRegistration = activeRegistration ?? registration;
  const existingSubscription =
    await pushRegistration.pushManager.getSubscription();
  const subscription =
    existingSubscription ??
    (await pushRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(subscription.toJSON()),
  });

  if (!response.ok) {
    throw new Error("Browser notification setup could not be saved.");
  }
}

export function urlBase64ToUint8Array(
  base64String: string,
): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`
    .replaceAll("-", "+")
    .replaceAll("_", "/");
  const rawData = globalThis.atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}
