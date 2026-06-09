import type { Metadata } from "next";

import { ScreenFrame } from "@/components/layout/ScreenFrame";
import { NotificationPermissionPanel } from "@/components/settings/NotificationPermissionPanel";
import { getSettingsPageData } from "@/lib/services/settings.service";

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
      </div>
    </ScreenFrame>
  );
}

function SettingsPanel({
  title,
  children,
}: Readonly<{
  title: string;
  children: React.ReactNode;
}>) {
  return (
    <section className="border border-line bg-background p-5 sm:p-6">
      <h2 className="text-xl font-bold leading-tight">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
