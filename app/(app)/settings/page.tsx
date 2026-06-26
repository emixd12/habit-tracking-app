import type { Metadata } from "next";
import { Suspense } from "react";

import {
  ScreenContentLoading,
  ScreenFrame,
} from "@/components/layout/ScreenFrame";
import { AccountDeletionPanel } from "@/components/settings/AccountDeletionPanel";
import { NotificationPermissionPanel } from "@/components/settings/NotificationPermissionPanel";
import { TimezonePanel } from "@/components/settings/TimezonePanel";
import {
  SettingsPanel,
  TrustAndLegalPanel,
} from "@/components/settings/SettingsPanels";
import { getSettingsPageData } from "@/lib/services/settings.service";
import { withPerformanceRoute } from "@/lib/services/performance-timing";
import { deleteAccountAction, updateTimezoneAction } from "./actions";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <ScreenFrame title="Settings">
      <Suspense fallback={<ScreenContentLoading label="Loading settings" />}>
        <SettingsContent />
      </Suspense>
    </ScreenFrame>
  );
}

async function SettingsContent() {
  const settings = await withPerformanceRoute(
    "/settings",
    "page.data_load",
    () => getSettingsPageData(),
  );

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <SettingsPanel title="Profile" className="md:col-span-2">
        <dl className="grid gap-2 text-sm leading-6 text-muted-readable">
          <div>
            <dt className="font-bold text-foreground">Email</dt>
            <dd className="break-words">{settings.email}</dd>
          </div>
        </dl>
      </SettingsPanel>

      <TimezonePanel
        currentTimezone={settings.timezone}
        updateTimezoneAction={updateTimezoneAction}
      />

      <NotificationPermissionPanel
        vapidPublicKey={settings.vapidPublicKey}
      />

      <TrustAndLegalPanel />

      <AccountDeletionPanel
        confirmationLabel={settings.deleteConfirmationLabel}
        deleteAccountAction={deleteAccountAction}
      />
    </div>
  );
}
