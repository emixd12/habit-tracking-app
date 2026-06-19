import type { Metadata } from "next";

import { ScreenFrame } from "@/components/layout/ScreenFrame";
import { AccountDeletionPanel } from "@/components/settings/AccountDeletionPanel";
import { NotificationPermissionPanel } from "@/components/settings/NotificationPermissionPanel";
import { TimezonePanel } from "@/components/settings/TimezonePanel";
import {
  SettingsPanel,
  TrustAndLegalPanel,
} from "@/components/settings/SettingsPanels";
import { getSettingsPageData } from "@/lib/services/settings.service";
import { deleteAccountAction, updateTimezoneAction } from "./actions";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const settings = await getSettingsPageData();

  return (
    <ScreenFrame title="Settings">
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
    </ScreenFrame>
  );
}
