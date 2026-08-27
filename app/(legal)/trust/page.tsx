import type { Metadata } from "next";

import { LegalPageContent } from "@/components/settings/LegalContent";
import { TrustEvidencePanel } from "@/components/trust/TrustEvidencePanel";
import { getPublicTrustEvidence } from "@/lib/services/public-trust-evidence.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trust",
  description:
    "Cadence trust information for manual statuses, account isolation, portability, and reminders.",
};

export default async function TrustPage() {
  const evidence = await getPublicTrustEvidence();

  return (
    <LegalPageContent pageKey="trust">
      <TrustEvidencePanel evidence={evidence} />
    </LegalPageContent>
  );
}
