import type { Metadata } from "next";

import { ScreenFrame } from "@/components/layout/ScreenFrame";
import { AccountDeletionPanel } from "@/components/settings/AccountDeletionPanel";
import { NotificationPermissionPanel } from "@/components/settings/NotificationPermissionPanel";
import {
  SettingsPanel,
  TrustAndLegalPanel,
} from "@/components/settings/SettingsPanels";
import { getSettingsPageData } from "@/lib/services/settings.service";
import { deleteAccountAction } from "./actions";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const settings = await getSettingsPageData();

  return (
    <ScreenFrame title="Settings">
      <div className="grid gap-5 md:grid-cols-2">
        <SettingsPanel title="Profile">
          <dl className="grid gap-2 text-sm leading-6 text-muted-readable">
            <div>
              <dt className="font-bold text-foreground">Email</dt>
              <dd className="break-words">{settings.email}</dd>
            </div>
          </dl>
        </SettingsPanel>

        <SettingsPanel title="Timezone">
          <dl className="grid gap-2 text-sm leading-6 text-muted-readable">
            <div>
              <dt className="font-bold text-foreground">Current timezone</dt>
              <dd>{settings.timezone}</dd>
            </div>
          </dl>
        </SettingsPanel>

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
