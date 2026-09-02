import type { Metadata } from "next";

import { LegalPageContent } from "@/components/settings/LegalContent";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms for the hosted Cadence personal behavior tracker, including account, export, source-license, and dispute terms.",
};

export default function TermsPage() {
  return <LegalPageContent pageKey="terms" />;
}
