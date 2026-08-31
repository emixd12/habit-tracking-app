import type { Metadata } from "next";

import { LegalPageContent } from "@/components/settings/LegalContent";
import { TrustEvidencePanel } from "@/components/trust/TrustEvidencePanel";
import { getPublicTrustEvidence } from "@/lib/services/public-trust-evidence.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trust",
  description:
    "Current, bounded deployment, route, supply-chain, and hosted-data evidence for Cadence.",
};

export default async function TrustPage() {
  const evidence = await getPublicTrustEvidence();

  return (
    <LegalPageContent pageKey="trust">
      <TrustEvidencePanel evidence={evidence} />
    </LegalPageContent>
  );
}
