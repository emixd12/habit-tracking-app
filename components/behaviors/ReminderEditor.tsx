type ReminderEditorProps = Readonly<{
  browserReminderEnabled: boolean;
  emailReminderEnabled: boolean;
  reminderOffsetMinutes: number;
  error?: string;
}>;

const REMINDER_OFFSETS = [
  { value: 0, label: "At scheduled time" },
  { value: 15, label: "15 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" },
  { value: 4320, label: "3 days before" },
] as const;

export function ReminderEditor({
  browserReminderEnabled,
  emailReminderEnabled,
  reminderOffsetMinutes,
  error,
}: ReminderEditorProps) {
  return (
    <fieldset className="grid gap-4 border-2 border-foreground p-4">
      <legend className="px-2 text-sm font-bold">Reminders</legend>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex min-h-12 items-center gap-3 border-2 border-foreground bg-background px-3 py-2 text-sm font-bold hover:bg-surface">
          <input
            type="checkbox"
            name="browser_reminder"
            defaultChecked={browserReminderEnabled}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          Browser reminder
        </label>

        <label className="flex min-h-12 items-center gap-3 border-2 border-foreground bg-background px-3 py-2 text-sm font-bold hover:bg-surface">
          <input
            type="checkbox"
            name="email_reminder"
            defaultChecked={emailReminderEnabled}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          Email reminder
        </label>
      </div>

      <label className="grid gap-2 text-sm font-bold">
        <span>Reminder offset</span>
        <select
          name="reminder_offset"
          defaultValue={reminderOffsetMinutes}
          className="min-h-11 border-2 border-foreground bg-background px-3 py-2 text-base font-normal text-foreground"
        >
          {REMINDER_OFFSETS.map((offset) => (
            <option key={offset.value} value={offset.value}>
              {offset.label}
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <p className="border-2 border-accent p-3 text-sm leading-6 text-accent">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
