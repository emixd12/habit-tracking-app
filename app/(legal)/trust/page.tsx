import type { Metadata } from "next";

import { LegalPageContent } from "@/components/settings/LegalContent";

export const metadata: Metadata = {
  title: "Trust",
  description:
    "Cadence trust information for manual statuses, account isolation, portability, and reminders.",
};

export default function TrustPage() {
  return <LegalPageContent pageKey="trust" />;
}
