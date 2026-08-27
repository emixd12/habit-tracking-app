import type { PublicTrustView } from "@/lib/services/public-trust-evidence.service";

const STATUS_LABELS = {
  passed: "Passed",
  failed: "Failed",
  stale: "Stale",
  not_run: "Not run",
  unavailable: "Unavailable",
} as const;

const STATUS_SYMBOLS = {
  passed: "✓",
  failed: "×",
  stale: "◷",
  not_run: "○",
  unavailable: "—",
} as const;

function formatTimestamp(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(new Date(value)) + " UTC"
    : "Not available";
}

export function TrustEvidencePanel({ evidence }: { evidence: PublicTrustView }) {
  return (
    <section aria-labelledby="trust-evidence-title" className="border-b border-line pb-6">
      <h2 id="trust-evidence-title" className="text-2xl leading-tight">
        Current verification results
      </h2>
      <p className="mt-4 max-w-3xl text-base leading-7 text-muted-readable">
        These checks are bounded, time-specific evidence. They do not certify Cadence or prove that defects are absent.
      </p>
      {evidence.feed_message ? (
        <p role="status" className="mt-4 border-l-2 border-accent pl-3 text-sm leading-6">
          {evidence.feed_message}
        </p>
      ) : null}
      {evidence.snapshot ? (
        <dl className="mt-5 grid gap-x-6 gap-y-2 border-y border-line py-4 text-sm leading-6 sm:grid-cols-2">
          <div><dt className="text-muted-readable">Covered commit</dt><dd className="break-all font-mono">{evidence.snapshot.source_commit}</dd></div>
          <div><dt className="text-muted-readable">Last validated</dt><dd>{formatTimestamp(evidence.snapshot.verified_at)}</dd></div>
          <div><dt className="text-muted-readable">Application deployment</dt><dd className="break-all font-mono">{evidence.snapshot.application_deployment_id}</dd></div>
          <div><dt className="text-muted-readable">Marketing deployment</dt><dd className="break-all font-mono">{evidence.snapshot.marketing_deployment_id}</dd></div>
        </dl>
      ) : null}
      <div className="mt-6 divide-y divide-line border-y border-line">
        {evidence.checks.map((check) => (
          <article key={check.id} className="py-5" data-status={check.status}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
              <h3 className="text-lg leading-6">{check.label}</h3>
              <p className="text-sm leading-6" aria-label={`Status: ${STATUS_LABELS[check.status]}`}>
                <span aria-hidden="true" className="mr-2">{STATUS_SYMBOLS[check.status]}</span>
                {STATUS_LABELS[check.status]}
              </p>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6">{check.summary}</p>
            {check.unavailable_reason ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-readable">Reason: {check.unavailable_reason}</p> : null}
            <dl className="mt-3 grid gap-2 text-sm leading-6 text-muted-readable">
              <div><dt className="inline text-foreground">Scope: </dt><dd className="inline">{check.scope}</dd></div>
              <div><dt className="inline text-foreground">Limit: </dt><dd className="inline">{check.scope_limit}</dd></div>
              <div><dt className="inline text-foreground">Last verified: </dt><dd className="inline">{formatTimestamp(check.completed_at)}</dd></div>
              <div><dt className="inline text-foreground">Fresh until: </dt><dd className="inline">{formatTimestamp(check.freshness_deadline)}</dd></div>
            </dl>
            {check.evidence_url ? (
              <a className="product-action product-action-secondary mt-3 text-sm" href={check.evidence_url} rel="noreferrer">
                Open immutable evidence for {check.label}
              </a>
            ) : null}
          </article>
        ))}
      </div>
      <p className="mt-5 max-w-3xl text-sm leading-6 text-muted-readable">
        Provenance connects one source commit to named deployments. Artifact integrity checks generated public files. Neither check covers later provider configuration or every live workflow.
      </p>
    </section>
  );
}
