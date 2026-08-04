export const faqItems: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: "What is Cadence?",
    answer:
      "Cadence is an open-source tracker for recurring behaviors. You define a behavior and its schedule, each scheduled slot becomes an occurrence on a today-first timeline, and you mark each one Completed or Not Completed. The full history exports as plain files any tool can read.",
  },
  {
    question: "Why are there no streaks, badges, or points?",
    answer:
      "We think gamification gets in the way of honest records. A streak makes the number the goal, and one bad day turns into a reason to quit. Cadence shows adherence over 7, 30, or 90 days and leaves motivation to you. The record is the product.",
  },
  {
    question: "What happens if I miss a day?",
    answer:
      "Nothing is marked for you. An occurrence you did not decide stays Unresolved, and prior-day unresolved items collect in a small Needs decision group until you settle them. Cadence never converts silence into failure.",
  },
  {
    question: "Can I track how long a behavior takes?",
    answer:
      "Yes. Any of today's occurrences — or one still waiting in Needs decision — can carry a timer: start it when you begin, stop it when you finish, reset it if you need a clean slate. Reviews show totals and averages alongside adherence.",
  },
  {
    question: "Is tracked time included in my exports?",
    answer:
      "Only if you ask for it. Exact session timestamps can reveal your daily patterns, so every export leaves timing data out by default. When you do include it, the download filename says so.",
  },
  {
    question: "Who can see my data?",
    answer:
      "Cadence is single-player by design. Your account is private, and there is no social feed, no sharing, and no coaching layer reading your history. The marketing site carries no analytics.",
  },
  {
    question: "Can I leave and take everything with me?",
    answer:
      "Anytime. Export your full history as JSONL, CSV, a complete JSON snapshot, a Markdown summary, or a BehaviorLog bundle — plain files with a manifest and checksums that open without Cadence.",
  },
  {
    question: "What is BehaviorLog?",
    answer:
      "BehaviorLog is the open record format behind Cadence's portability. A bundle is plain JSONL files plus a manifest, a schema, and SHA-256 checksums, so another tool — or an AI agent — can read your history without access to your account. The standard lives in its own repository (https://github.com/emixd12/BehaviorLog-Bundle).",
  },
  {
    question: "Is Cadence free?",
    answer:
      "Yes. The code is public and open source, and the app has no paid plans or payment features.",
  },
];

export function buildFaqMarkdown(): string {
  const lines = [
    "# Frequently Asked Questions",
    "",
    "Short, factual answers. If something is missing, the codebase and docs are public.",
    "",
  ];

  for (const item of faqItems) {
    lines.push(`## ${item.question}`, "", item.answer, "");
  }

  return lines.join("\n").trimEnd();
}
