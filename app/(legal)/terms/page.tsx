import type { Metadata } from "next";

import { LegalPageContent } from "@/components/settings/LegalContent";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms for using Cadence as a personal behavior tracker.",
};

export default function TermsPage() {
  return <LegalPageContent pageKey="terms" />;
}
