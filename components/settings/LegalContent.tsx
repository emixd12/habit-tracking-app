export type LegalPageKey = "privacy" | "terms" | "trust";

type LegalSection = Readonly<{
  title: string;
  paragraphs: readonly string[];
  items?: readonly string[];
}>;

type LegalPage = Readonly<{
  title: string;
  summary: string;
  updated: string;
  sections: readonly LegalSection[];
}>;

export const LEGAL_PAGE_ORDER: readonly LegalPageKey[] = [
  "privacy",
  "terms",
  "trust",
];

export const LEGAL_PAGES: Readonly<Record<LegalPageKey, LegalPage>> = {
  privacy: {
    title: "Privacy",
    summary:
      "Cadence stores the account and behavior data needed to run a private recurring-behavior tracker.",
    updated: "June 19, 2026",
    sections: [
      {
        title: "Data Cadence stores",
        paragraphs: [
          "Cadence stores the email from Google sign-in when available, profile timezone, categories, behaviors, schedules, reminders, occurrences, statuses, notes, exports, imports, push subscription records, and reminder delivery records.",
          "Behavior and occurrence notes are free text. Treat them as personal records and avoid storing details you do not want in the app.",
        ],
      },
      {
        title: "How data is used",
        paragraphs: [
          "The app uses account data to authenticate the user, generate scheduled occurrences, show the Timeline, save manual Completed or Not Completed decisions, send configured reminders, build basic analytics, and create exports.",
          "Unresolved occurrences are left unresolved until the user acts. Cadence does not automatically mark a prior occurrence as missed or failed.",
        ],
      },
      {
        title: "Service providers",
        paragraphs: [
          "Cadence uses Supabase for authentication and database storage, Vercel for the deployed web app, browser push APIs for browser reminders, and Sequenzy only when email reminders are enabled.",
          "The launch app does not include marketing analytics, advertising pixels, payment tracking, or social tracking.",
        ],
      },
      {
        title: "Portability and deletion",
        paragraphs: [
          "The Export screen provides portable JSONL, CSV, full JSON, Markdown, and BehaviorLog bundle downloads.",
          "The Settings screen provides account deletion. Export records before deleting an account because deletion is permanent.",
        ],
      },
    ],
  },
  terms: {
    title: "Terms",
    summary:
      "Cadence is a public, open-source personal behavior tracker for one independent account at a time.",
    updated: "June 19, 2026",
    sections: [
      {
        title: "Use of the app",
        paragraphs: [
          "Cadence is for recording personal recurring behaviors, scheduled occurrences, manual statuses, notes, reminders, analytics, and exports.",
          "Each account is single-player. Do not use Cadence for shared workspaces, social tracking, public profiles, or administration of other people.",
        ],
      },
      {
        title: "Manual record",
        paragraphs: [
          "Completed and Not Completed are explicit user decisions. Unresolved means no decision has been recorded.",
          "Needs decision is a UI group for prior unresolved occurrences. It is not a stored status and should not be treated as an automatic failure.",
        ],
      },
      {
        title: "Boundaries",
        paragraphs: [
          "Cadence is not an emergency system, clinical decision tool, medication dosing system, supply or refill tracker, or calendar sync product.",
          "The user is responsible for deciding whether the app is appropriate for a specific personal workflow.",
        ],
      },
      {
        title: "Account and data",
        paragraphs: [
          "Sign-in uses Google through Supabase Auth. Keep the Google account secure and sign out on shared devices.",
          "Cadence provides exports for account portability. The Settings screen provides account deletion for the signed-in account.",
        ],
      },
    ],
  },
  trust: {
    title: "Trust",
    summary:
      "The app is designed around manual truth, account isolation, portability, and small product scope.",
    updated: "June 19, 2026",
    sections: [
      {
        title: "Manual truth",
        paragraphs: [
          "The system does not infer completion or failure. A record changes only when the signed-in user marks an occurrence Completed or Not Completed.",
          "Prior unresolved occurrences are brought forward for decision without changing their stored status.",
        ],
      },
      {
        title: "Account isolation",
        paragraphs: [
          "Cadence is built for many independent single-account users. User-owned records are expected to stay scoped to the authenticated user.",
          "The app does not include shared workspaces, public profiles, social features, or admin-heavy product surfaces.",
        ],
      },
      {
        title: "Portability",
        paragraphs: [
          "Export is a first-class part of the product. The app supports machine-readable downloads and BehaviorLog bundle export so the user can keep a portable record.",
          "Account deletion should be paired with export access so a user can leave with a copy of their history.",
        ],
      },
      {
        title: "Reminder boundaries",
        paragraphs: [
          "Browser reminders depend on browser permission and push subscription support. Email reminders are optional per behavior.",
          "If reminders are unavailable, denied, or delayed, the tracker still works as a manual record.",
        ],
      },
    ],
  },
};

export function LegalPageContent({
  pageKey,
}: Readonly<{
  pageKey: LegalPageKey;
}>) {
  const page = LEGAL_PAGES[pageKey];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <nav
        aria-label="Legal pages"
        className="flex flex-wrap gap-2 border-b border-line pb-4 text-sm leading-6"
      >
        {LEGAL_PAGE_ORDER.map((key) => {
          const item = LEGAL_PAGES[key];

          return (
            <a
              key={key}
              href={`/${key}`}
              aria-current={key === pageKey ? "page" : undefined}
              className={[
                "border border-line px-3 py-2 transition-colors hover:bg-surface",
                key === pageKey ? "bg-timeline-row-hover" : "bg-background",
              ].join(" ")}
            >
              {item.title}
            </a>
          );
        })}
      </nav>

      <header className="border-b border-line pb-8">
        <p className="text-sm leading-6 text-muted-readable">
          Last updated {page.updated}
        </p>
        <h1 className="mt-3 text-3xl leading-tight sm:text-4xl">
          {page.title}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-readable">
          {page.summary}
        </p>
      </header>

      <div className="grid gap-8">
        {page.sections.map((section) => (
          <section key={section.title} className="border-b border-line pb-8">
            <h2 className="text-2xl leading-tight">{section.title}</h2>
            <div className="mt-4 grid max-w-3xl gap-3 text-base leading-7 text-muted-readable">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.items ? (
                <ul className="grid gap-2 pl-5">
                  {section.items.map((item) => (
                    <li key={item} className="list-disc">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>
        ))}
      </div>

      <footer className="flex flex-wrap gap-3 text-sm leading-6">
        <a
          href="/login"
          className="border border-line bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-foreground"
        >
          Sign in
        </a>
        <a
          href="/settings"
          className="border border-line bg-background px-4 py-2 transition-colors hover:bg-surface"
        >
          Open settings
        </a>
      </footer>
    </main>
  );
}
