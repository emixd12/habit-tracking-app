import type { Metadata } from "next";
import type { ReactNode } from "react";
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
    <SettingsPanelGrid>
      <SettingsProfile email={settings.email} />

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
    </SettingsPanelGrid>
  );
}

export function SettingsPanelGrid({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="grid min-w-0 grid-cols-1 divide-y divide-line">
      {children}
    </div>
  );
}

export function SettingsProfile({ email }: Readonly<{ email: string }>) {
  return (
    <SettingsPanel title="Profile">
      <dl className="grid min-w-0 gap-2 text-sm leading-6 text-muted-readable">
        <div className="min-w-0">
          <dt className="font-bold text-foreground">Email</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]">{email}</dd>
        </div>
      </dl>
    </SettingsPanel>
  );
}
