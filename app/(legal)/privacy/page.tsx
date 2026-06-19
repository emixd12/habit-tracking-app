import type { Metadata } from "next";

import { LegalPageContent } from "@/components/settings/LegalContent";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "Privacy information for Cadence account, behavior, reminder, and export data.",
};

export default function PrivacyPage() {
  return <LegalPageContent pageKey="privacy" />;
}
