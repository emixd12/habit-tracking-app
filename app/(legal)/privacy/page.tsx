import type { Metadata } from "next";

import { LegalPageContent } from "@/components/settings/LegalContent";

export const metadata: Metadata = {
  title: "Privacy Policy Draft",
  description:
    "Draft Cadence privacy policy covering account data, processors, retention, exports, choices, and contact information.",
};

export default function PrivacyPage() {
  return <LegalPageContent pageKey="privacy" />;
}
