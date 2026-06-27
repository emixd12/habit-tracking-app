type ReminderEditorProps = Readonly<{
  browserReminderEnabled: boolean;
  emailReminderEnabled: boolean;
  reminderOffsetMinutes: number;
  error?: string;
}>;

const REMINDER_OFFSETS = [
  { value: 0, label: "At scheduled start" },
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
    <fieldset className="grid gap-4 border-0 p-0">
      <legend className="mb-1 text-base font-bold">Reminders</legend>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex min-h-12 items-center gap-3 border border-line bg-background px-3 py-2 text-sm font-bold hover:bg-surface">
          <input
            type="checkbox"
            name="browser_reminder"
            defaultChecked={browserReminderEnabled}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          Browser notifications
        </label>

        <label className="flex min-h-12 items-center gap-3 border border-line bg-background px-3 py-2 text-sm font-bold hover:bg-surface">
          <input
            type="checkbox"
            name="email_reminder"
            defaultChecked={emailReminderEnabled}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          Email reminder
        </label>
      </div>
      <p className="text-sm leading-6 text-muted-readable">
        Browser notifications send reminders on devices where notifications are
        enabled.
      </p>

      <label className="grid gap-2">
        <span className="text-xs font-bold text-muted-readable">
          Reminder offset
        </span>
        <select
          name="reminder_offset"
          defaultValue={reminderOffsetMinutes}
          className="min-h-11 border border-line bg-background px-3 py-2 text-base font-normal text-foreground"
        >
          {REMINDER_OFFSETS.map((offset) => (
            <option key={offset.value} value={offset.value}>
              {offset.label}
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <p className="border-t border-line pt-3 text-sm leading-6 text-accent">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
