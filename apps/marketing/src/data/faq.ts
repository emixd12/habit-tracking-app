import { exportFormats, statusDefinitions } from "./vocabulary";

export type FaqItem = { id: string; question: string; answer: string };
export type FaqGroup = { id: string; title: string; items: readonly FaqItem[] };

export const faqGroups: readonly FaqGroup[] = [
  { id: "recording-model", title: "Recording model", items: [
    { id: "what-is-cadence", question: "What is Cadence?", answer: `Cadence is an open-source tracker for recurring behaviors. You define a Behavior and its Schedule, and Cadence creates each Occurrence on a today-first timeline. ${statusDefinitions.completed} ${statusDefinitions.notCompleted} ${statusDefinitions.unresolved}` },
    { id: "what-happens-without-a-decision", question: "What happens if I do not make a decision?", answer: `${statusDefinitions.unresolved} Prior-day Unresolved Occurrences collect in Needs decision until you decide them. Cadence never converts silence into failure.` },
    { id: "why-no-streaks", question: "Why are there no streaks, badges, or points?", answer: "Cadence keeps the Record focused on explicit Decisions. It shows Adherence over 7, 30, or 90 days without turning a streak or score into the goal." },
  ] },
  { id: "context-and-history", title: "Context and history", items: [
    { id: "track-elapsed-time", question: "Can I track how long a behavior takes?", answer: "Yes. An Occurrence scheduled for today, or one still in Needs decision, can carry elapsed time. Start, stop, and reset the timer. Reviews show totals and averages alongside Adherence." },
    { id: "preserve-definition-history", question: "What happens when I rename or redefine a Behavior?", answer: "Cadence preserves title and description revision history in JSON and BehaviorLog exports. The current app does not provide a full revision browser." },
    { id: "add-context", question: "What Context can I add?", answer: "You can add an optional note and elapsed time to an Occurrence. Context does not decide whether the Occurrence is Completed or Not Completed." },
  ] },
  { id: "review-and-analysis", title: "Review and analysis", items: [
    { id: "how-adherence-works", question: "How does Adherence work?", answer: "Cadence shows Adherence across 7, 30, or 90 days. Adherence is the share of decided Occurrences marked Completed. Unresolved Occurrences remain separate from final calculations." },
    { id: "use-external-ai", question: "Can I analyze my Record with an AI service?", answer: "Cadence provides prepared prompts. You export the data and choose an external AI service. Cadence does not send behavior data to an AI provider." },
  ] },
  { id: "privacy-and-portability", title: "Privacy and portability", items: [
    { id: "who-can-see-data", question: "Who can see my data?", answer: "Cadence is single-player by design. There is no social feed or collaboration layer. Read the Privacy page for the current data practices and the Trust page for bounded operational evidence." },
    { id: "export-formats", question: "Can I leave and take my Record with me?", answer: `Yes. Export your history as ${exportFormats.join(", ")}. These files can be inspected without Cadence.` },
    { id: "timing-in-exports", question: "Is tracked time included in my exports?", answer: "Only when you choose to include it. Exports omit timing data by default because exact session timestamps can reveal activity patterns." },
    { id: "what-is-behaviorlog", question: "What is BehaviorLog?", answer: "BehaviorLog is the open portability standard used by Cadence. A bundle contains plain JSONL files, a manifest, schemas, and SHA-256 checksums. The standard lives at https://github.com/emixd12/BehaviorLog-Bundle." },
    { id: "current-price", question: "What does Cadence cost?", answer: "Cadence is currently available without charge." },
  ] },
];

export const faqItems = faqGroups.flatMap((group) => group.items);

export function buildFaqMarkdown(): string {
  const lines = ["# Frequently Asked Questions", "", "Detailed answers about Cadence's recording model, context, review, privacy, and portability.", ""];
  for (const group of faqGroups) {
    lines.push(`## ${group.title}`, "");
    for (const item of group.items) lines.push(`### ${item.question}`, "", item.answer, "");
  }
  return lines.join("\n").trimEnd();
}
