import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import manifestJson from "@/design-system.manifest.json";
import usageJson from "@/design-system.usage.json";
import { AnalyticsScreen } from "@/components/analytics/AnalyticsScreen";
import { BehaviorForm } from "@/components/behaviors/BehaviorForm";
import { BehaviorList } from "@/components/behaviors/BehaviorList";
import { RecurrenceEditor } from "@/components/behaviors/RecurrenceEditor";
import { ReminderEditor } from "@/components/behaviors/ReminderEditor";
import { ExportPanel } from "@/components/export/ExportPanel";
import { MarkdownSummaryActions } from "@/components/export/MarkdownSummaryActions";
import { AppShell } from "@/components/layout/AppShell";
import { ScreenFrame } from "@/components/layout/ScreenFrame";
import { NotificationPermissionPanel } from "@/components/settings/NotificationPermissionPanel";
import { NeedsDecisionDialog } from "@/components/timeline/NeedsDecisionDialog";
import { OccurrenceNoteForm } from "@/components/timeline/OccurrenceNoteForm";
import { OccurrenceRow } from "@/components/timeline/OccurrenceRow";
import { StatusButtons } from "@/components/timeline/StatusButtons";
import { Timeline } from "@/components/timeline/Timeline";
import { TimelineGroup } from "@/components/timeline/TimelineGroup";
import { GoogleLoginButton } from "@/app/(auth)/login/GoogleLoginButton";
import { APP_NAV_ITEMS } from "@/lib/navigation";
import type { AnalyticsView } from "@/lib/types/analytics";
import type {
  BehaviorActionState,
  BehaviorFormAction,
  BehaviorRecurrenceFormDefaults,
  BehaviorView,
  CategoryOption,
} from "@/lib/types/behavior";
import type { ExportBundle } from "@/lib/types/export";
import type {
  OccurrenceActionState,
  OccurrenceFormAction,
  TimelineDaySection,
  TimelineOccurrenceView,
  TimelineView,
} from "@/lib/types/timeline";

export const metadata: Metadata = {
  title: "Design system bench",
};

type ManifestEntry = {
  id: string;
  name: string;
  kind: string;
  source: string;
  exportName: string;
  benchAnchor: string;
  trackUsages: string;
  status: string;
  notes: string;
};

type Manifest = {
  components: ManifestEntry[];
};

type UsageEntry = {
  componentId: string;
  file: string;
  line: number;
  route: string | null;
  usageKind: string;
  confidence: string;
};

type Usage = {
  usages: UsageEntry[];
  summary: {
    productUsages: number;
    benchPreviews: number;
  };
};

const manifest = manifestJson as Manifest;
const usage = usageJson as Usage;

const kindOrder = [
  "navigation",
  "layout",
  "flow",
  "module",
  "composite",
  "primitive",
  "token",
];

async function benchBehaviorAction(
  previousState: BehaviorActionState,
  formData: FormData,
): Promise<BehaviorActionState> {
  "use server";

  void previousState;
  void formData;

  return {
    status: "success",
    message: "Bench action only. No product data changed.",
  };
}

async function benchOccurrenceAction(
  previousState: OccurrenceActionState,
  formData: FormData,
): Promise<OccurrenceActionState> {
  "use server";

  void previousState;

  const status = formData.get("status");
  const nextStatus =
    status === "completed" || status === "not_completed" ? status : undefined;

  return {
    status: "success",
    message: "Bench action only. No occurrence was changed.",
    ...(nextStatus ? { nextStatus } : {}),
  };
}

export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const usageByComponent = groupUsages(usage.usages);
  const previews = buildPreviews();

  return (
    <main
      className="min-h-dvh bg-neutral-100 text-neutral-950"
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <BenchHeader />
        <BenchNav />
        <Foundations />
        <TraceInventory usageByComponent={usageByComponent} previews={previews} />
      </div>
    </main>
  );
}

function BenchHeader() {
  return (
    <header className="grid gap-4 border border-neutral-300 bg-white p-5 sm:p-6">
      <div className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Local design-system bench
        </p>
        <h1 className="text-3xl font-semibold tracking-normal text-neutral-950">
          Cadence UI traceability
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-neutral-600">
          This route renders fixture-backed product UI for inspection. It is not
          in primary navigation, does not query Supabase, and is disabled in
          production builds.
        </p>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-4">
        <Metric label="Tracked items" value={manifest.components.length} />
        <Metric label="Product usages" value={usage.summary.productUsages} />
        <Metric label="Bench previews" value={usage.summary.benchPreviews} />
        <Metric label="Theme toggle" value="Not detected" />
      </dl>
    </header>
  );
}

function Metric({
  label,
  value,
}: Readonly<{
  label: string;
  value: string | number;
}>) {
  return (
    <div className="border border-neutral-300 bg-neutral-50 p-3">
      <dt className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tracking-normal text-neutral-950">
        {value}
      </dd>
    </div>
  );
}

function BenchNav() {
  return (
    <nav
      aria-label="Bench sections"
      className="flex flex-wrap gap-2 border border-neutral-300 bg-white p-3 text-sm"
    >
      <BenchAnchor href="#ds-foundations">Foundations</BenchAnchor>
      <BenchAnchor href="#ds-primitives">Primitives</BenchAnchor>
      <BenchAnchor href="#bench-traces">Trace cards</BenchAnchor>
    </nav>
  );
}

function BenchAnchor({
  href,
  children,
}: Readonly<{
  href: string;
  children: ReactNode;
}>) {
  return (
    <a
      href={href}
      className="border border-neutral-300 bg-neutral-50 px-3 py-2 font-semibold text-neutral-800 hover:bg-neutral-200"
    >
      {children}
    </a>
  );
}

function Foundations() {
  return (
    <section id="ds-foundations" className="grid gap-4">
      <SectionHeading
        eyebrow="Required coverage"
        title="Foundations"
        description="Product tokens and primitive patterns are shown visually here. Bench chrome stays neutral; product samples use the app's actual Tailwind tokens."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <FoundationPanel
          id="ds-foundation-typography"
          title="Typography"
          preview={
            <ProductPreview>
              <div className="grid gap-3 bg-background text-foreground">
                <p className="border border-line bg-surface px-3 py-2 text-sm font-bold text-foreground">
                  Font family: IBM Plex Sans
                </p>
                <p className="text-sm font-bold text-muted-readable">
                  Private behavior ledger
                </p>
                <h2 className="text-4xl font-bold leading-tight">
                  Timeline
                </h2>
                <p className="max-w-prose text-base leading-7 text-muted-readable">
                  Thursday, June 11
                </p>
              </div>
            </ProductPreview>
          }
        />

        <FoundationPanel
          id="ds-foundation-font-scale"
          title="Font scale"
          preview={
            <ProductPreview>
              <div className="grid gap-3 bg-background text-foreground">
                <p className="text-4xl font-bold leading-tight">Display 30</p>
                <p className="text-3xl font-bold leading-tight">Heading 24</p>
                <p className="text-2xl font-bold leading-tight">Section 20</p>
                <p className="text-base leading-7">Body 14 with open leading</p>
                <p className="text-sm font-bold text-muted-readable">
                  Label 12
                </p>
              </div>
            </ProductPreview>
          }
        />

        <FoundationPanel
          id="ds-foundation-color"
          title="Color"
          preview={
            <ProductPreview>
              <div className="grid gap-3 sm:grid-cols-2">
                <Swatch name="Background" className="bg-background text-foreground" />
                <Swatch name="Surface" className="bg-surface text-foreground" />
                <Swatch name="Foreground" className="bg-foreground text-background" />
                <Swatch
                  name="Primary"
                  className="bg-primary text-primary-foreground"
                />
                <Swatch name="Accent" className="bg-accent text-background" />
                <Swatch
                  name="Readable muted"
                  className="bg-background text-muted-readable"
                />
                <Swatch
                  name="Timeline row hover"
                  className="bg-timeline-row-hover text-foreground"
                />
                <Swatch
                  name="Needs decision hover"
                  className="bg-timeline-needs-decision-hover text-foreground"
                />
                <Swatch
                  name="Completed row hover"
                  className="bg-timeline-completed-hover text-primary-foreground"
                />
              </div>
            </ProductPreview>
          }
        />

        <FoundationPanel
          id="ds-foundation-spacing"
          title="Spacing"
          preview={
            <ProductPreview>
              <div className="grid gap-4 bg-background text-foreground">
                {[8, 16, 24, 40, 64].map((size) => (
                  <div key={size} className="flex items-center gap-3">
                    <span className="w-12 text-sm font-bold">{size}px</span>
                    <span
                      className="block h-4 bg-primary"
                      style={{ width: `${size * 2}px` }}
                    />
                  </div>
                ))}
              </div>
            </ProductPreview>
          }
        />

        <FoundationPanel
          id="ds-foundation-radius"
          title="Radius"
          preview={
            <ProductPreview>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="border border-line bg-background p-4 text-sm font-bold">
                  0px card
                </div>
                <button
                  type="button"
                  className="border border-line bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
                >
                  0px button
                </button>
                <input
                  aria-label="Square input sample"
                  defaultValue="0px input"
                  className="border border-line bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
            </ProductPreview>
          }
        />

        <FoundationPanel
          id="ds-foundation-border"
          title="Border"
          preview={
            <ProductPreview>
              <div className="grid gap-3 bg-background text-foreground">
                <div className="border border-line p-3 text-sm">
                  1px quiet divider
                </div>
                <div className="border border-line p-3 text-sm font-bold">
                  Same quiet divider on controls and panels
                </div>
              </div>
            </ProductPreview>
          }
        />

        <FoundationPanel
          id="ds-foundation-shadow"
          title="Shadow"
          preview={
            <ProductPreview>
              <div className="border border-line bg-background p-4 text-sm leading-6 text-muted-readable shadow-none">
                Elevation is intentionally flat: borders, spacing, and fills
                carry hierarchy.
              </div>
            </ProductPreview>
          }
        />

        <FoundationPanel
          id="ds-foundation-motion"
          title="Motion"
          preview={
            <ProductPreview>
              <button
                type="button"
                className="border border-line bg-background px-4 py-3 text-sm font-bold text-foreground transition-colors duration-200 hover:bg-primary hover:text-primary-foreground motion-reduce:transition-none"
              >
                200ms state transition
              </button>
            </ProductPreview>
          }
        />
      </div>

      <section id="ds-primitives" className="grid gap-4">
        <SectionHeading
          eyebrow="Required coverage"
          title="Primitive patterns"
          description="The app does not have primitive component files yet, so this section shows the actual product classes used for common controls."
        />
        <ProductPreview>
          <div className="grid gap-5 bg-background text-foreground">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="min-h-11 border border-line bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
              >
                Primary
              </button>
              <button
                type="button"
                className="min-h-11 border border-line bg-background px-4 py-2 text-sm font-bold text-foreground"
              >
                Secondary
              </button>
              <button
                type="button"
                disabled
                className="min-h-11 border border-line bg-surface px-4 py-2 text-sm font-bold text-muted-readable"
              >
                Disabled
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <input
                aria-label="Primitive input sample"
                defaultValue="Text input"
                className="min-h-11 border border-line bg-background px-3 py-2 text-base text-foreground"
              />
              <select
                aria-label="Primitive select sample"
                defaultValue="daily"
                className="min-h-11 border border-line bg-background px-3 py-2 text-base text-foreground"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
              <span className="inline-flex min-h-11 items-center border border-line bg-surface px-3 py-2 text-sm font-bold">
                Badge
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <article className="border border-line bg-background p-4">
                <h3 className="text-lg font-bold">Card surface</h3>
                <p className="mt-2 text-sm leading-6 text-muted-readable">
                  Square, flat, and structured by borders.
                </p>
              </article>
              <div className="border border-line bg-surface p-4">
                <div className="border border-line bg-background p-4">
                  <h3 className="text-lg font-bold">Overlay panel</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-readable">
                    Modal vocabulary uses the same flat product surfaces.
                  </p>
                </div>
              </div>
            </div>

            <a
              href="/timeline"
              className="w-fit border border-line bg-background px-3 py-2 text-sm font-bold text-foreground hover:bg-surface"
            >
              Product link
            </a>
          </div>
        </ProductPreview>
      </section>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: Readonly<{
  eyebrow: string;
  title: string;
  description: string;
}>) {
  return (
    <header className="grid gap-1 border border-neutral-300 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {eyebrow}
      </p>
      <h2 className="text-2xl font-semibold tracking-normal text-neutral-950">
        {title}
      </h2>
      <p className="max-w-3xl text-sm leading-6 text-neutral-600">
        {description}
      </p>
    </header>
  );
}

function FoundationPanel({
  id,
  title,
  preview,
}: Readonly<{
  id: string;
  title: string;
  preview: ReactNode;
}>) {
  return (
    <article id={id} className="grid gap-3 border border-neutral-300 bg-white p-4">
      <h3 className="text-base font-semibold tracking-normal text-neutral-950">
        {title}
      </h3>
      {preview}
    </article>
  );
}

function Swatch({
  name,
  className,
}: Readonly<{
  name: string;
  className: string;
}>) {
  return (
    <div className={["border border-line p-4 text-sm font-bold", className].join(" ")}>
      {name}
    </div>
  );
}

function TraceInventory({
  usageByComponent,
  previews,
}: Readonly<{
  usageByComponent: Map<string, UsageEntry[]>;
  previews: Record<string, ReactNode>;
}>) {
  const grouped = groupManifestEntries(manifest.components);

  return (
    <section id="bench-traces" className="grid gap-5">
      <SectionHeading
        eyebrow="Inventory"
        title="Trace cards"
        description="Each tracked item shows source ownership, fixture preview coverage, and product usage locations. Usage drawers are closed by default."
      />

      {grouped.map(([kind, entries]) => (
        <section key={kind} className="grid gap-3">
          <h3 className="border-b border-neutral-400 pb-2 text-lg font-semibold capitalize tracking-normal text-neutral-950">
            {kind}
          </h3>
          <div className="grid gap-4">
            {entries.map((entry) => (
              <TraceCard
                key={entry.id}
                entry={entry}
                usages={usageByComponent.get(entry.id) ?? []}
                preview={previews[entry.id]}
              />
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

function TraceCard({
  entry,
  usages,
  preview,
}: Readonly<{
  entry: ManifestEntry;
  usages: UsageEntry[];
  preview: ReactNode;
}>) {
  const anchor = anchorFragment(entry.benchAnchor);
  const hasPreview = Boolean(preview);
  const needsVisibleStatus = !hasPreview || usages.length === 0;

  return (
    <article
      id={anchor}
      data-ds-id={entry.id}
      data-ds-status={hasPreview ? "covered" : "missing-preview"}
      className="grid gap-4 border border-neutral-300 bg-white p-4"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="break-words text-xl font-semibold tracking-normal text-neutral-950">
              {entry.name}
            </h4>
            {needsVisibleStatus ? (
              <span className="border border-amber-400 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">
                {!hasPreview ? "Missing preview" : "Unused"}
              </span>
            ) : null}
          </div>
          <p className="mt-2 break-words text-sm text-neutral-600">
            {entry.source} · export {entry.exportName}
          </p>
          {entry.notes ? (
            <p className="mt-2 text-sm leading-6 text-neutral-600">{entry.notes}</p>
          ) : null}
        </div>

        <p className="border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-800">
          {usages.length} product {usages.length === 1 ? "usage" : "usages"}
        </p>
      </div>

      {hasPreview ? preview : null}

      <details className="border border-neutral-300 bg-neutral-50">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-neutral-800">
          Usage locations
        </summary>
        <div className="border-t border-neutral-300 p-3">
          {usages.length === 0 ? (
            <p className="text-sm text-neutral-600">No product usages found.</p>
          ) : (
            <ul className="grid gap-2 text-sm text-neutral-700">
              {usages.map((item) => (
                <li key={`${item.file}:${item.line}:${item.usageKind}`}>
                  <code className="font-mono">
                    {item.file}:{item.line}
                  </code>
                  <span> · {item.route ?? "component"} · {item.confidence}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </article>
  );
}

function ProductPreview({
  children,
  maxHeight = "44rem",
}: Readonly<{
  children: ReactNode;
  maxHeight?: string;
}>) {
  return (
    <div
      className="relative overflow-auto border border-neutral-300 bg-white p-3"
      style={{
        contain: "layout paint",
        maxHeight,
        transform: "translateZ(0)",
      }}
    >
      <div
        className="bg-background text-foreground"
        style={{
          fontFamily:
            'var(--font-ibm-plex-sans), "IBM Plex Sans", Arial, Helvetica, sans-serif',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function buildPreviews(): Record<string, ReactNode> {
  const behaviorAction: BehaviorFormAction = benchBehaviorAction;
  const occurrenceAction: OccurrenceFormAction = benchOccurrenceAction;

  return {
    "navigation.primary-app-nav": (
      <ProductPreview>
        <nav
          aria-label="Primary route registry"
          className="grid w-64 border border-line bg-card py-3"
        >
          {APP_NAV_ITEMS.map((item, index) => (
            <a
              key={item.href}
              href={item.href}
              className={[
                "flex h-10 w-full items-center overflow-hidden text-sm",
                index === 0
                  ? "bg-timeline-row-hover text-foreground"
                  : "text-muted-foreground hover:bg-surface hover:text-foreground",
              ].join(" ")}
            >
              <span className="flex h-10 w-16 shrink-0 items-center justify-center">
                <span className="h-4 w-4 border border-current" />
              </span>
              <span className="min-w-0 truncate whitespace-nowrap">
                {item.label}
              </span>
              <span
                className={[
                  "ml-auto truncate px-3 text-xs",
                  index === 0 ? "text-foreground" : "text-muted-readable",
                ].join(" ")}
              >
                {item.href}
              </span>
            </a>
          ))}
        </nav>
      </ProductPreview>
    ),
    "layout.app-shell": (
      <ProductPreview maxHeight="38rem">
        <AppShell>
          <div className="p-6">
            <section className="border border-line bg-background p-5">
              <h2 className="text-2xl font-bold">App shell preview</h2>
              <p className="mt-2 text-sm leading-6 text-muted-readable">
                Sidebar and mobile navigation render from the live shell.
              </p>
            </section>
          </div>
        </AppShell>
      </ProductPreview>
    ),
    "layout.screen-frame": (
      <ProductPreview>
        <ScreenFrame
          title="Screen frame"
          description="Shared route frame for protected product screens."
        >
          <div className="border border-line bg-surface p-5 text-sm leading-6 text-muted-readable">
            Screen content sits below a consistent title and description.
          </div>
        </ScreenFrame>
      </ProductPreview>
    ),
    "flow.google-login-button": (
      <ProductPreview>
        <GoogleLoginButton disabled nextPath="/timeline" />
      </ProductPreview>
    ),
    "module.timeline": (
      <ProductPreview maxHeight="48rem">
        <Timeline
          timeline={timelineFixture}
          statusAction={occurrenceAction}
          noteAction={occurrenceAction}
        />
      </ProductPreview>
    ),
    "module.timeline-group": (
      <ProductPreview>
        <TimelineGroup
          section={todaySection}
          statusAction={occurrenceAction}
          noteAction={occurrenceAction}
        />
      </ProductPreview>
    ),
    "composite.occurrence-row": (
      <ProductPreview>
        <div className="grid gap-3">
          {[needsDecisionOccurrence, completedOccurrence, notCompletedOccurrence].map(
            (occurrence) => (
              <OccurrenceRow
                key={occurrence.id}
                occurrence={occurrence}
                statusAction={occurrenceAction}
                noteAction={occurrenceAction}
              />
            ),
          )}
        </div>
      </ProductPreview>
    ),
    "module.status-buttons": (
      <ProductPreview>
        <StatusButtons
          occurrenceId="bench-occurrence-current"
          currentStatus="unresolved"
          action={occurrenceAction}
        />
      </ProductPreview>
    ),
    "composite.occurrence-note-form": (
      <ProductPreview>
        <OccurrenceNoteForm
          occurrenceId="bench-occurrence-note"
          note="Slept poorly, but completed the evening reset."
          action={occurrenceAction}
        />
      </ProductPreview>
    ),
    "module.needs-decision-dialog": (
      <ProductPreview maxHeight="24rem">
        <NeedsDecisionDialog title="Needs decision" occurrenceCount={1}>
          <TimelineGroup
            section={needsDecisionSection}
            statusAction={occurrenceAction}
            noteAction={occurrenceAction}
          />
        </NeedsDecisionDialog>
      </ProductPreview>
    ),
    "composite.behavior-form": (
      <ProductPreview maxHeight="48rem">
        <BehaviorForm
          mode="create"
          action={behaviorAction}
          categories={categoryOptions}
        />
      </ProductPreview>
    ),
    "module.behavior-list": (
      <ProductPreview maxHeight="50rem">
        <BehaviorList
          activeBehaviors={[activeBehavior]}
          archivedBehaviors={[archivedBehavior]}
          categories={categoryOptions}
          updateAction={behaviorAction}
          archiveAction={behaviorAction}
          restoreAction={behaviorAction}
        />
      </ProductPreview>
    ),
    "module.recurrence-editor": (
      <ProductPreview>
        <RecurrenceEditor defaults={weeklyRecurrenceDefaults} />
      </ProductPreview>
    ),
    "module.reminder-editor": (
      <ProductPreview>
        <ReminderEditor
          browserReminderEnabled
          emailReminderEnabled={false}
          reminderOffsetMinutes={60}
        />
      </ProductPreview>
    ),
    "module.analytics-screen": (
      <ProductPreview maxHeight="50rem">
        <AnalyticsScreen analytics={analyticsFixture} />
      </ProductPreview>
    ),
    "module.export-panel": (
      <ProductPreview maxHeight="50rem">
        <ExportPanel exportData={exportFixture} />
      </ProductPreview>
    ),
    "module.markdown-summary-actions": (
      <ProductPreview>
        <MarkdownSummaryActions
          summary={exportFixture.markdownSummary}
          fileName={exportFixture.markdownFileName}
        />
      </ProductPreview>
    ),
    "module.notification-permission-panel": (
      <ProductPreview>
        <div className="grid gap-5 md:grid-cols-2">
          <NotificationPermissionPanel vapidPublicKey="" />
        </div>
      </ProductPreview>
    ),
  };
}

function groupUsages(items: UsageEntry[]) {
  const grouped = new Map<string, UsageEntry[]>();

  for (const item of items) {
    const existing = grouped.get(item.componentId) ?? [];
    existing.push(item);
    grouped.set(item.componentId, existing);
  }

  return grouped;
}

function groupManifestEntries(entries: ManifestEntry[]) {
  const grouped = new Map<string, ManifestEntry[]>();

  for (const entry of entries) {
    const existing = grouped.get(entry.kind) ?? [];
    existing.push(entry);
    grouped.set(entry.kind, existing);
  }

  return [...grouped.entries()].sort(
    ([kindA], [kindB]) => kindRank(kindA) - kindRank(kindB),
  );
}

function kindRank(kind: string) {
  const index = kindOrder.indexOf(kind);
  return index === -1 ? kindOrder.length : index;
}

function anchorFragment(anchor: string) {
  return anchor.split("#", 2)[1] ?? anchor;
}

const categoryOptions: CategoryOption[] = [
  { id: "category-health", name: "Health" },
  { id: "category-home", name: "Home" },
  { id: "category-focus", name: "Focus" },
];

const weeklyRecurrenceDefaults: BehaviorRecurrenceFormDefaults = {
  kind: "weekly",
  dailyInterval: 1,
  everyDays: 2,
  weeklyInterval: 1,
  weeklyDays: ["monday", "wednesday", "friday"],
  monthlyInterval: 1,
  monthlyDay: 31,
};

const activeBehavior: BehaviorView = {
  id: "behavior-reset",
  title: "Evening reset",
  description: "Close the day with a short checklist and note anything unusual.",
  categoryId: "category-home",
  categoryName: "Home",
  recurrenceSummary: "Weekly on Mon, Wed, Fri",
  recurrenceDefaults: weeklyRecurrenceDefaults,
  scheduledTime: "21:30",
  scheduledTimeLabel: "9:30 PM",
  scheduleSlots: [
    {
      id: "slot-evening-reset",
      kind: "exact",
      preset: null,
      startTime: "21:30",
      endTime: null,
      sortOrder: 0,
      label: "9:30 PM",
    },
  ],
  scheduleSummary: "9:30 PM",
  timezone: "America/New_York",
  browserReminderEnabled: true,
  emailReminderEnabled: false,
  reminderOffsetMinutes: 60,
  reminderSummary: "Browser reminder, 1 hour before",
  active: true,
  archivedAt: null,
  createdAt: "2026-05-01T12:00:00Z",
  updatedAt: "2026-06-08T12:00:00Z",
};

const archivedBehavior: BehaviorView = {
  ...activeBehavior,
  id: "behavior-archived",
  title: "Archive sample",
  description: "Past behavior kept for history.",
  active: false,
  archivedAt: "2026-06-01T12:00:00Z",
  reminderSummary: "No reminders",
};

const needsDecisionOccurrence: TimelineOccurrenceView = {
  id: "occurrence-prior",
  behaviorId: "behavior-reset",
  title: "Evening reset",
  scheduledFor: "2026-06-07T01:30:00Z",
  scheduledTimeLabel: "9:30 PM",
  localDate: "2026-06-06",
  status: "unresolved",
  statusLabel: "Unresolved",
  statusDetail: "Awaiting decision",
  expandedStatusActionLabel: "Mark this occurrence",
  visualTone: "needs_decision",
  showDecisionActions: true,
  showCollapsedStatusLabel: false,
  description: activeBehavior.description,
  categoryName: activeBehavior.categoryName,
  scheduleSummary: activeBehavior.recurrenceSummary,
  note: "",
};

const currentOccurrence: TimelineOccurrenceView = {
  ...needsDecisionOccurrence,
  id: "occurrence-current",
  behaviorId: "behavior-water",
  scheduledFor: "2026-06-08T13:00:00Z",
  scheduledTimeLabel: "Morning",
  localDate: "2026-06-08",
  title: "Drink water",
  visualTone: "default",
  showDecisionActions: true,
  description: "Start the morning with one full glass.",
  categoryName: "Health",
  scheduleSummary: "Daily",
};

const currentGroupedCompletedOccurrence: TimelineOccurrenceView = {
  ...currentOccurrence,
  id: "occurrence-current-evening",
  scheduledFor: "2026-06-08T22:00:00Z",
  scheduledTimeLabel: "Evening",
  status: "completed",
  statusLabel: "Completed",
  statusDetail: "Resolved as Completed",
  expandedStatusActionLabel: "Change logged action",
  visualTone: "completed",
  showDecisionActions: false,
  showCollapsedStatusLabel: true,
  note: "Finished after work.",
};

const completedOccurrence: TimelineOccurrenceView = {
  ...currentOccurrence,
  id: "occurrence-completed",
  behaviorId: "behavior-walk",
  title: "Walk outside",
  scheduledFor: "2026-06-08T16:00:00Z",
  scheduledTimeLabel: "12:00 PM",
  status: "completed",
  statusLabel: "Completed",
  statusDetail: "Resolved as Completed",
  expandedStatusActionLabel: "Change logged action",
  visualTone: "completed",
  showDecisionActions: false,
  showCollapsedStatusLabel: true,
  note: "Short walk after lunch.",
};

const notCompletedOccurrence: TimelineOccurrenceView = {
  ...currentOccurrence,
  id: "occurrence-not-completed",
  behaviorId: "behavior-desk",
  title: "Desk reset",
  scheduledFor: "2026-06-08T22:00:00Z",
  scheduledTimeLabel: "6:00 PM",
  status: "not_completed",
  statusLabel: "Not Completed",
  statusDetail: "Resolved as Not Completed",
  expandedStatusActionLabel: "Change logged action",
  visualTone: "not_completed",
  showDecisionActions: true,
  showCollapsedStatusLabel: false,
  note: "Skipped while traveling.",
};

const futureOccurrence: TimelineOccurrenceView = {
  ...currentOccurrence,
  id: "occurrence-future",
  title: "Plan tomorrow",
  scheduledFor: "2026-06-09T01:00:00Z",
  scheduledTimeLabel: "9:00 PM",
  localDate: "2026-06-08",
  showDecisionActions: false,
};

function toFixtureOccurrenceGroups(occurrences: TimelineOccurrenceView[]) {
  return occurrences.map((occurrence) => ({
    key: `${occurrence.localDate}-${occurrence.id}`,
    behaviorId: occurrence.behaviorId,
    title: occurrence.title,
    occurrences: [occurrence],
    isGroupedStack: false,
  }));
}

const needsDecisionSection: TimelineDaySection = {
  key: "needs-2026-06-06",
  kind: "needs_decision_day",
  localDate: "2026-06-06",
  label: "Saturday, June 6",
  relativeLabel: "Prior unresolved",
  emptyMessage: "No prior unresolved occurrences.",
  occurrences: [needsDecisionOccurrence],
  occurrenceGroups: toFixtureOccurrenceGroups([needsDecisionOccurrence]),
};

const todaySection: TimelineDaySection = {
  key: "today-2026-06-08",
  kind: "today",
  localDate: "2026-06-08",
  label: "Monday, June 8",
  relativeLabel: "Today",
  emptyMessage: "No behaviors on this day.",
  occurrences: [
    currentOccurrence,
    currentGroupedCompletedOccurrence,
    completedOccurrence,
    notCompletedOccurrence,
  ],
  occurrenceGroups: [
    {
      key: "group-water-2026-06-08",
      behaviorId: "behavior-water",
      title: "Drink water",
      occurrences: [currentOccurrence, currentGroupedCompletedOccurrence],
      isGroupedStack: true,
    },
    ...toFixtureOccurrenceGroups([completedOccurrence, notCompletedOccurrence]),
  ],
};

const futureSection: TimelineDaySection = {
  key: "future-2026-06-09",
  kind: "future",
  localDate: "2026-06-09",
  label: "Tuesday, June 9",
  relativeLabel: "Tomorrow",
  emptyMessage: "No behaviors on this day.",
  occurrences: [futureOccurrence],
  occurrenceGroups: toFixtureOccurrenceGroups([futureOccurrence]),
};

const timelineFixture: TimelineView = {
  timezone: "America/New_York",
  todayLocalDate: "2026-06-08",
  visibleFutureDays: 7,
  maxFutureDays: 30,
  nextFutureDays: 14,
  needsDecision: {
    title: "Needs decision",
    emptyMessage: "No prior unresolved occurrences.",
    occurrenceCount: 1,
    daySections: [needsDecisionSection],
  },
  daySections: [todaySection, futureSection],
};

const emptyCounts = {
  completedCount: 0,
  notCompletedCount: 0,
  unresolvedCount: 0,
  resolvedCount: 0,
  totalCount: 0,
};

const analyticsFixture: AnalyticsView = {
  timezone: "America/New_York",
  rangeDays: 30,
  rangeOptions: [7, 30, 90],
  rangeStartLocalDate: "2026-05-10",
  rangeEndLocalDate: "2026-06-08",
  rangeLabel: "Last 30 days",
  summary: {
    completedCount: 18,
    notCompletedCount: 4,
    unresolvedCount: 3,
    resolvedCount: 22,
    totalCount: 25,
    rate: 0.818,
    percentLabel: "82%",
    detailLabel: "18 of 22 resolved occurrences completed",
  },
  overallHeatmap: [
    dayCell("2026-06-02", "Jun 2", "2", "completed", false),
    dayCell("2026-06-03", "Jun 3", "3", "not_completed", false),
    dayCell("2026-06-04", "Jun 4", "4", "completed", false),
    dayCell("2026-06-05", "Jun 5", "5", "unresolved", false),
    dayCell("2026-06-06", "Jun 6", "6", "empty", false),
    dayCell("2026-06-07", "Jun 7", "7", "completed", false),
    dayCell("2026-06-08", "Jun 8", "8", "not_completed", true),
  ],
  behaviorSummaries: [
    {
      behaviorId: "behavior-reset",
      title: "Evening reset",
      categoryName: "Home",
      completedCount: 8,
      notCompletedCount: 2,
      unresolvedCount: 1,
      resolvedCount: 10,
      totalCount: 11,
      rate: 0.8,
      percentLabel: "80%",
      detailLabel: "8 of 10 resolved",
      dailyCells: [
        behaviorCell("2026-06-02", "Jun 2", "2", "full"),
        behaviorCell("2026-06-03", "Jun 3", "3", "partial"),
        behaviorCell("2026-06-04", "Jun 4", "4", "full"),
        behaviorCell("2026-06-05", "Jun 5", "5", "unresolved"),
        behaviorCell("2026-06-06", "Jun 6", "6", "empty"),
        behaviorCell("2026-06-07", "Jun 7", "7", "full"),
        behaviorCell("2026-06-08", "Jun 8", "8", "not_completed"),
      ],
    },
  ],
  categorySummaries: [
    {
      categoryName: "Home",
      completedCount: 8,
      notCompletedCount: 2,
      unresolvedCount: 1,
      resolvedCount: 10,
      totalCount: 11,
      rate: 0.8,
      percentLabel: "80%",
      detailLabel: "8 of 10 resolved",
    },
    {
      categoryName: "Health",
      completedCount: 10,
      notCompletedCount: 2,
      unresolvedCount: 2,
      resolvedCount: 12,
      totalCount: 14,
      rate: 0.833,
      percentLabel: "83%",
      detailLabel: "10 of 12 resolved",
    },
  ],
  selectedDay: {
    localDate: "2026-06-08",
    label: "Monday, June 8",
    emptyMessage: "No Not Completed occurrences on this day.",
    notCompletedOccurrences: [
      {
        id: "occurrence-not-completed",
        behaviorId: "behavior-reset",
        title: "Desk reset",
        categoryName: "Home",
        scheduledFor: "2026-06-08T22:00:00Z",
        scheduledTimeLabel: "6:00 PM",
        note: "Skipped while traveling.",
      },
    ],
  },
};

const exportReminderOffsetKey = ["reminder", "offset", "minutes"].join(
  "_",
) as keyof ExportBundle["jsonBackup"]["behaviors"][number];

const exportJsonBehaviorFixture = {
  id: "behavior-reset",
  category_id: "category-home",
  category: "Home",
  title: "Evening reset",
  description: activeBehavior.description,
  recurrence_rule: {
    frequency: "weekly",
    interval: 1,
    daysOfWeek: ["monday", "wednesday", "friday"],
  },
  scheduled_time: "21:30",
  schedule_slots: activeBehavior.scheduleSlots,
  timezone: "America/New_York",
  browser_reminder_enabled: true,
  email_reminder_enabled: false,
  [exportReminderOffsetKey]: 60,
  active: true,
  archived_at: null,
} as unknown as ExportBundle["jsonBackup"]["behaviors"][number];

const exportFixture: ExportBundle = {
  timezone: "America/New_York",
  exportedAt: "2026-06-08T21:00:00Z",
  includeArchived: false,
  range: {
    key: "30",
    label: "Last 30 days",
    startLocalDate: "2026-05-10",
    endLocalDate: "2026-06-08",
    summaryLabel: "Last 30 days",
  },
  rangeOptions: [
    { key: "7", label: "Last 7 days" },
    { key: "30", label: "Last 30 days" },
    { key: "90", label: "Last 90 days" },
    { key: "all", label: "All time" },
  ],
  categoryCount: 2,
  behaviorCount: 2,
  occurrenceCount: 4,
  overallCounts: {
    completedCount: 2,
    notCompletedCount: 1,
    unresolvedCount: 1,
    resolvedCount: 3,
    totalCount: 4,
  },
  overallAdherenceLabel: "67%",
  jsonl: "{\"type\":\"behavior\",\"title\":\"Evening reset\"}",
  csv: "behavior_title,status\nEvening reset,completed",
  jsonBackup: {
    exported_at: "2026-06-08T21:00:00Z",
    profile: { timezone: "America/New_York" },
    categories: [
      {
        id: "category-home",
        name: "Home",
        sort_order: 1,
      },
    ],
    behaviors: [
      exportJsonBehaviorFixture,
    ],
    occurrences: [
      {
        id: "occurrence-completed",
        behavior_id: "behavior-reset",
        behavior_schedule_slot_id: "slot-evening-reset",
        behavior_title: "Evening reset",
        category: "Home",
        scheduled_for: "2026-06-08T16:00:00Z",
        schedule: "9:30 PM",
        schedule_kind: "exact",
        schedule_preset: null,
        schedule_start_time: "21:30",
        schedule_end_time: null,
        local_date: "2026-06-08",
        timezone: "America/New_York",
        status: "completed",
        completed_at: "2026-06-08T16:10:00Z",
        status_marked_at: "2026-06-08T16:10:00Z",
        note: "Short walk after lunch.",
      },
    ],
  },
  json: "{\"profile\":{\"timezone\":\"America/New_York\"}}",
  markdownSummary:
    "# Cadence export summary\n\nRange: Last 30 days\n\nDefault adherence: 67%\n\n- Completed: 2\n- Not Completed: 1\n- Unresolved: 1",
  fileBaseName: "cadence-export-2026-06-08",
  markdownFileName: "cadence-summary-2026-06-08.md",
  behaviorLog: {
    fileName: "cadence-export-2026-06-08.behaviorlog.zip",
    files: [
      {
        path: "manifest.json",
        mediaType: "application/json",
        content: "{\"format\":\"behaviorlog.bundle\"}",
      },
      {
        path: "data/status_events.jsonl",
        mediaType: "application/jsonl",
        content:
          "{\"record_type\":\"status_event\",\"status\":\"completed\"}",
      },
    ],
  },
};

function dayCell(
  localDate: string,
  label: string,
  shortLabel: string,
  state: AnalyticsView["overallHeatmap"][number]["state"],
  isSelected: boolean,
) {
  return {
    key: `overall-${localDate}`,
    localDate,
    label,
    shortLabel,
    isSelected,
    state,
    stateLabel: state,
    counts:
      state === "completed"
        ? {
            completedCount: 1,
            notCompletedCount: 0,
            unresolvedCount: 0,
            resolvedCount: 1,
            totalCount: 1,
          }
        : state === "not_completed"
          ? {
              completedCount: 0,
              notCompletedCount: 1,
              unresolvedCount: 0,
              resolvedCount: 1,
              totalCount: 1,
            }
          : state === "unresolved"
            ? {
                completedCount: 0,
                notCompletedCount: 0,
                unresolvedCount: 1,
                resolvedCount: 0,
                totalCount: 1,
              }
            : emptyCounts,
    ariaLabel: `${label}: ${state}`,
  };
}

function behaviorCell(
  localDate: string,
  label: string,
  shortLabel: string,
  state: AnalyticsView["behaviorSummaries"][number]["dailyCells"][number]["state"],
) {
  return {
    key: `behavior-${localDate}`,
    localDate,
    label,
    shortLabel,
    state,
    stateLabel: state,
    counts:
      state === "full"
        ? {
            completedCount: 1,
            notCompletedCount: 0,
            unresolvedCount: 0,
            resolvedCount: 1,
            totalCount: 1,
          }
        : state === "partial" || state === "not_completed"
          ? {
              completedCount: state === "partial" ? 1 : 0,
              notCompletedCount: 1,
              unresolvedCount: 0,
              resolvedCount: state === "partial" ? 2 : 1,
              totalCount: state === "partial" ? 2 : 1,
            }
          : state === "unresolved"
            ? {
                completedCount: 0,
                notCompletedCount: 0,
                unresolvedCount: 1,
                resolvedCount: 0,
                totalCount: 1,
              }
            : emptyCounts,
    ariaLabel: `${label}: ${state}`,
  };
}
