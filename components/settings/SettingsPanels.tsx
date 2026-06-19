import type { ReactNode } from "react";

import { LEGAL_PAGE_ORDER, LEGAL_PAGES } from "@/components/settings/LegalContent";

type SettingsPanelProps = Readonly<{
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}>;

export function SettingsPanel({
  title,
  description,
  children,
  className = "",
}: SettingsPanelProps) {
  return (
    <section
      className={["border border-line bg-background p-5 sm:p-6", className]
        .filter(Boolean)
        .join(" ")}
    >
      <h2 className="text-xl leading-tight">{title}</h2>
      {description ? (
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-readable">
          {description}
        </p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function TrustAndLegalPanel() {
  return (
    <SettingsPanel
      title="Trust and legal"
      description="Public account, data, and product-boundary information."
    >
      <ul className="grid divide-y divide-line border-y border-line text-sm leading-6">
        {LEGAL_PAGE_ORDER.map((key) => {
          const page = LEGAL_PAGES[key];

          return (
            <li key={key}>
              <a
                href={`/${key}`}
                className="grid gap-1 px-0 py-3 transition-colors hover:bg-surface sm:grid-cols-[10rem_minmax(0,1fr)]"
              >
                <span className="text-foreground">{page.title}</span>
                <span className="text-muted-readable">{page.summary}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </SettingsPanel>
  );
}
