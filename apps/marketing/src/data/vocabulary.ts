export const statusDefinitions = {
  completed: "Completed means the user declared the occurrence completed.",
  notCompleted:
    "Not Completed means the user declared the occurrence not completed.",
  unresolved: "Unresolved means the user has not made a decision.",
} as const;

export const exportFormats = [
  "JSONL",
  "JSON",
  "CSV",
  "Markdown",
  "BehaviorLog bundle",
] as const;

export const vocabulary = [
  {
    term: "Behavior",
    short: "A recurring thing the user wants to track.",
    full: "A Behavior defines what the user tracks and owns one or more Schedules.",
  },
  {
    term: "Schedule",
    short: "A recurrence pattern with one or more times.",
    full: "A Schedule defines when Cadence generates Occurrences for a Behavior.",
  },
  {
    term: "Occurrence",
    short: "One scheduled instance of a Behavior.",
    full: "An Occurrence is the unit the user can mark, annotate, and optionally time.",
  },
  {
    term: "Decision",
    short: "The user's explicit status choice for an Occurrence.",
    full: "A Decision declares an Occurrence Completed or Not Completed and can be revised later.",
  },
  {
    term: "Completed",
    short: statusDefinitions.completed,
    full: statusDefinitions.completed,
  },
  {
    term: "Not Completed",
    short: statusDefinitions.notCompleted,
    full: statusDefinitions.notCompleted,
  },
  {
    term: "Unresolved",
    short: statusDefinitions.unresolved,
    full: statusDefinitions.unresolved,
  },
  {
    term: "Context",
    short: "Optional information attached to a Record.",
    full: "Context can include notes and timing data without changing an Occurrence's Decision.",
  },
  {
    term: "Revision",
    short: "A recorded change to a Behavior definition or Decision.",
    full: "A Revision preserves a later title, description, or Decision change without silently replacing its history.",
  },
  {
    term: "Adherence",
    short: "The share of decided Occurrences marked Completed.",
    full: "Adherence excludes Unresolved Occurrences from final calculations.",
  },
  {
    term: "Record",
    short: "Preserved behavior data and its history.",
    full: "A Record keeps Occurrences, Decisions, Revisions, and optional Context inspectable.",
  },
  {
    term: "View",
    short: "A presentation of Records for review.",
    full: "A View organizes Records without changing their underlying facts.",
  },
  {
    term: "BehaviorLog",
    short: "The open portability standard used by Cadence.",
    full: "BehaviorLog packages portable behavior Records for inspection and exchange between tools.",
  },
] as const;
