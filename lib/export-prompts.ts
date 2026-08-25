export type ExportPromptTemplate = Readonly<{
  id: string;
  title: string;
  purpose: string;
  requirements: string;
  prompt: string;
}>;

export const EXPORT_PROMPT_SEMANTICS_PREAMBLE = `How to read my Cadence export:
- Status values are Completed, Not Completed, and Unresolved. Unresolved means no decision was recorded; treat it as missing data, never as failure. In the app, Unresolved occurrences appear as Needs decision items.
- Occurrence rows are current snapshots. When the export includes status_events, that append-only history is the source of truth for chronology and corrections: recorded_at is when a decision was logged, effective_at is its stated effective time when present, and revises_event_id links a correction to the event it revises.
- Use local_date with my IANA timezone for any day-of-week or date analysis, not UTC timestamps.
- When behavior_configuration_events is present, segment schedule analysis only at captured schedule_graph, timezone, or active changes. Treat reminder-only and category-only revisions as context, not new schedule periods. A configuration change is descriptive history; do not claim it caused an outcome or provide clinical guidance.
- Report Completed versus Not Completed adherence and Unresolved counts separately; never fold Unresolved into failures.
- In raw export files these statuses appear as "completed", "not_completed", and "unresolved".`;

export const EXPORT_PROMPT_TEMPLATES: readonly ExportPromptTemplate[] = [
  {
    id: "notes-failure-themes",
    title: "Notes-explained failures",
    purpose:
      "Cluster the reasons in occurrence notes for Not Completed occurrences into ranked themes.",
    requirements:
      "Needs any export format with the Include occurrence notes option selected; note values are blank otherwise.",
    prompt: `${EXPORT_PROMPT_SEMANTICS_PREAMBLE}

Task: From my Cadence export, collect every Not Completed occurrence that has a non-empty note. Cluster the notes into recurring reason themes, name each theme plainly, and rank themes two ways: by how many occurrences they explain and by how many distinct behaviors they affect. For each theme, list the behaviors involved and quote one representative note. Leave Unresolved occurrences out of this analysis; they are missing decisions, not explained failures.`,
  },
  {
    id: "weekday-time-dips",
    title: "Weekday and time-of-day dips",
    purpose:
      "Find systematically weak weekdays and schedule slots using local dates.",
    requirements:
      "Works with any export format. The App JSON backup and BehaviorLog bundle include the timezone; with JSONL or CSV, tell your assistant your timezone.",
    prompt: `${EXPORT_PROMPT_SEMANTICS_PREAMBLE}

Task: Compute adherence by day of week and by schedule slot label, using local_date and my timezone. Identify the weekday and slot combinations that are consistently weakest, quantify each dip against my overall rate, report Unresolved counts for those windows separately, and flag any window where the sample is too small to trust.`,
  },
  {
    id: "category-comparison",
    title: "Category comparison",
    purpose: "Compare adherence and undecided occurrences across categories.",
    requirements: "Works with any export format.",
    prompt: `${EXPORT_PROMPT_SEMANTICS_PREAMBLE}

Task: Group occurrences by category. For each category, report Completed versus Not Completed adherence and, separately, the count and share of Unresolved occurrences. Identify which category carries the most undecided occurrences, as distinct from the most failures; a category heavy in Unresolved needs decisions recorded, not necessarily behavior change.`,
  },
  {
    id: "logging-chronology",
    title: "Logging chronology and batching",
    purpose:
      "See whether decisions are logged near the occurrence or batched later, and what batching correlates with.",
    requirements:
      "Needs the App JSON backup or the BehaviorLog bundle; JSONL and CSV do not include status_events.",
    prompt: `${EXPORT_PROMPT_SEMANTICS_PREAMBLE}

Task: Using status_events, compare each decision's recorded_at with its occurrence's scheduled time. Classify decisions as logged near the occurrence or batched later, and look for batching sessions where many decisions share close recorded_at times. Report the split, when batching happens, and whether batched decisions correlate with more Not Completed outcomes or more later corrections. Present any correlation as descriptive, not as proof of cause.`,
  },
  {
    id: "correction-patterns",
    title: "Correction patterns",
    purpose:
      "Follow revision chains to see which decisions get corrected, in which direction, and how fast.",
    requirements:
      "Needs the App JSON backup or the BehaviorLog bundle; JSONL and CSV do not include status_events.",
    prompt: `${EXPORT_PROMPT_SEMANTICS_PREAMBLE}

Task: Using status_events, follow revises_event_id chains. Report which behaviors get corrected most, the dominant direction of correction, such as Not Completed later corrected to Completed, and the typical time between the first decision's recorded_at and the correction's recorded_at. Call out behaviors whose first decisions are least reliable.`,
  },
  {
    id: "reminder-effectiveness",
    title: "Reminder effectiveness",
    purpose:
      "Compare outcomes on occurrences with delivered reminders against occurrences without.",
    requirements:
      "Needs the BehaviorLog bundle; reminder deliveries are in data/interventions.jsonl, which is present only when the exported occurrences have any.",
    prompt: `${EXPORT_PROMPT_SEMANTICS_PREAMBLE}

Task: Match records in data/interventions.jsonl to their occurrences. Compare occurrences that had at least one delivered reminder against occurrences with none, on two outcomes: whether a decision was recorded at all, and the Completed rate among decided occurrences. Split the comparison by delivery channel. Reminders are not randomly assigned, so report differences as associations, not as proof the reminders caused them.`,
  },
  {
    id: "definition-drift",
    title: "Definition drift",
    purpose:
      "Segment a behavior's history by captured definition and configuration periods before comparing adherence over time.",
    requirements:
      "Needs the App JSON backup or the BehaviorLog bundle; JSONL and CSV do not include behavior definition history or configuration history.",
    prompt: `${EXPORT_PROMPT_SEMANTICS_PREAMBLE}

Task: Using behavior_definition_events and behavior_configuration_events, split each behavior's timeline at title or description changes and at captured schedule_graph, timezone, or active changes. Do not split schedule periods for reminder-only or category-only revisions. Compare adherence descriptively across periods, flag apparent trends that coincide with definition or schedule changes, and do not claim the changes caused outcomes or provide clinical guidance.`,
  },
  {
    id: "decision-debt",
    title: "Decision debt",
    purpose:
      "Profile where Unresolved occurrences accumulate and how old they get.",
    requirements: "Works with any export format.",
    prompt: `${EXPORT_PROMPT_SEMANTICS_PREAMBLE}

Task: Profile all Unresolved occurrences by behavior and by age in days since local_date. Report which behaviors accumulate the most undecided occurrences and how old they get. Treat them strictly as missing decisions, and suggest which behaviors most need an easier decision moment, such as a better time to resolve them.`,
  },
  {
    id: "schedule-load",
    title: "Schedule load and overcommitment",
    purpose: "Relate each day's scheduled load to that day's completion.",
    requirements: "Works with any export format.",
    prompt: `${EXPORT_PROMPT_SEMANTICS_PREAMBLE}

Task: For each local_date, count scheduled occurrences and compute that day's Completed versus Not Completed rate, with Unresolved counted separately. Determine whether heavier days complete less, where my daily capacity seems to sit, and which behaviors on the heaviest days look like candidates to reschedule or drop. Note whether apparent load effects are really driven by particular weekdays.`,
  },
  {
    id: "behavior-lifecycle",
    title: "Behavior lifecycle",
    purpose:
      "Compare early adherence after a behavior's creation against later periods.",
    requirements:
      "Needs the App JSON backup or the BehaviorLog bundle; JSONL and CSV do not include behavior definition history.",
    prompt: `${EXPORT_PROMPT_SEMANTICS_PREAMBLE}

Task: For each behavior, take its creation time from its baseline definition event in behavior_definition_events, the earliest event with null previous values. Compare adherence in the first weeks after creation against later periods. Identify novelty decay, a strong start that fades, and slow starts, a weak start that improves, and note where the export range truncates a behavior's early history.`,
  },
  {
    id: "realistic-timing",
    title: "Realistic timing",
    purpose:
      "Compare when behaviors actually happen with when they are scheduled.",
    requirements:
      "Needs the App JSON backup or the BehaviorLog bundle; JSONL and CSV do not include status_events.",
    prompt: `${EXPORT_PROMPT_SEMANTICS_PREAMBLE}

Task: Where status events include effective_at, compare those stated times with the occurrence's scheduled time for each behavior and slot. Report the typical offsets and suggest schedule times that match when I actually do the behavior. Skip events without effective_at rather than substituting recorded_at, which is only when the decision was logged.`,
  },
  {
    id: "cross-source-context",
    title: "Cross-source context",
    purpose:
      "Check adherence dips against calendar, travel, or sleep context your assistant already has.",
    requirements: "Works with any export format.",
    prompt: `${EXPORT_PROMPT_SEMANTICS_PREAMBLE}

Task: First, identify my clearest adherence dips from the export: specific date ranges, weekdays, or behaviors. Then, using only context you already have from sources I have connected and approve for this question, such as my calendar, email, sleep, or location history, look for plausible explanations like travel, busy stretches, or short sleep. Treat the Cadence export as the source of truth for what happened with the behaviors; other sources only add context. Report dips you cannot explain as unexplained.`,
  },
];

export async function copyPromptText(
  text: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined,
): Promise<"copied" | "failed"> {
  if (!clipboard) {
    return "failed";
  }

  try {
    await clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
