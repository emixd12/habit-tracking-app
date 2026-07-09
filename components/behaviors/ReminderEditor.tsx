type ReminderEditorProps = Readonly<{
  browserReminderEnabled: boolean;
  emailReminderEnabled: boolean;
  reminderOffsetMinutes: number;
  error?: string;
}>;

const COMPACT_UNDERLINED_FIELD_CONTROL_CLASS =
  "min-h-6 border-0 border-b border-line bg-background px-0 py-0.5 text-base text-foreground";

export function ReminderEditor({
  browserReminderEnabled,
  emailReminderEnabled,
  reminderOffsetMinutes,
  error,
}: ReminderEditorProps) {
  return (
    <fieldset className="grid gap-3 border-0 p-0">
      <legend className="mb-1 text-lg leading-tight">Reminders</legend>

      <div className="grid gap-2">
        <div className="grid gap-2 lg:grid-cols-[max-content_max-content_minmax(16rem,1fr)] lg:items-center lg:gap-x-5">
          <label className="flex min-h-11 items-center gap-2 py-1 text-sm">
            <input
              type="checkbox"
              name="browser_reminder"
              defaultChecked={browserReminderEnabled}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            Browser notifications
          </label>

          <label className="flex min-h-11 items-center gap-2 py-1 text-sm">
            <input
              type="checkbox"
              name="email_reminder"
              defaultChecked={emailReminderEnabled}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            Email reminder
          </label>

          <label className="grid gap-1 text-sm lg:ml-auto lg:flex lg:min-h-11 lg:w-full lg:items-center lg:gap-3">
            <span className="shrink-0">Reminder offset</span>
            <select
              name="reminder_offset"
              defaultValue={String(reminderOffsetMinutes)}
              className={`${COMPACT_UNDERLINED_FIELD_CONTROL_CLASS} lg:min-w-0 lg:flex-1`}
            >
              <option value="0">At scheduled start</option>
              <option value="15">15 minutes before</option>
              <option value="60">1 hour before</option>
              <option value="1440">1 day before</option>
              <option value="4320">3 days before</option>
            </select>
          </label>
        </div>

        <p className="text-sm leading-6 text-muted-readable">
          Browser reminders use devices that are enabled in Settings. If this
          device is not enabled or browser notifications are blocked, the
          behavior is still tracked.
        </p>
      </div>

      {error ? (
        <p className="border-t border-line pt-3 text-sm leading-6 text-accent">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
