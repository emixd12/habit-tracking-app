const loadingRows = [
  ["w-16", "w-52", "w-20", "w-24"],
  ["w-20", "w-64", "w-24", "w-20"],
  ["w-14", "w-44", "w-16", "w-28"],
  ["w-24", "w-56", "w-20", "w-24"],
] as const;

function SkeletonBlock({ className }: Readonly<{ className: string }>) {
  return (
    <span
      aria-hidden="true"
      className={["block bg-surface", className].join(" ")}
    />
  );
}

function LoadingRow({
  widths,
}: Readonly<{
  widths: readonly [string, string, string, string];
}>) {
  return (
    <div className="grid gap-3 py-4 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:items-center">
      <SkeletonBlock className={["h-3", widths[0]].join(" ")} />
      <div className="grid gap-2">
        <SkeletonBlock className={["h-4 max-w-full", widths[1]].join(" ")} />
        <SkeletonBlock className="h-3 w-32 max-w-[70%]" />
      </div>
      <div className="flex flex-wrap gap-4 sm:justify-end">
        <SkeletonBlock className={["h-3", widths[2]].join(" ")} />
        <SkeletonBlock className={["h-3", widths[3]].join(" ")} />
      </div>
    </div>
  );
}

export default function AppRouteLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-10 lg:py-10"
    >
      <span className="sr-only">Loading app route</span>

      <header className="border-b border-line pb-6" aria-hidden="true">
        <SkeletonBlock className="h-8 w-36 sm:h-9 sm:w-44" />
        <SkeletonBlock className="mt-3 h-4 w-full max-w-xl" />
      </header>

      <section
        aria-hidden="true"
        className="border-y border-line bg-background py-5 sm:py-6"
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="grid gap-3">
            <SkeletonBlock className="h-5 w-40" />
            <SkeletonBlock className="h-3 w-full max-w-2xl" />
            <SkeletonBlock className="h-3 w-5/6 max-w-xl" />
          </div>
          <div className="grid w-full grid-cols-4 border border-line lg:w-72">
            <SkeletonBlock className="h-10 border-r border-line" />
            <SkeletonBlock className="h-10 border-r border-line" />
            <SkeletonBlock className="h-10 border-r border-line" />
            <SkeletonBlock className="h-10" />
          </div>
        </div>
      </section>

      <section aria-hidden="true" className="grid divide-y divide-line border-y border-line">
        {loadingRows.map((widths) => (
          <LoadingRow key={widths.join("-")} widths={widths} />
        ))}
      </section>

      <section aria-hidden="true" className="grid gap-5 md:grid-cols-2">
        <div className="border-y border-line bg-background py-5 sm:py-6">
          <SkeletonBlock className="h-5 w-28" />
          <div className="mt-4 grid gap-3">
            <SkeletonBlock className="h-3 w-full max-w-sm" />
            <SkeletonBlock className="h-3 w-2/3 max-w-xs" />
          </div>
        </div>
        <div className="border-y border-line bg-background py-5 sm:py-6">
          <SkeletonBlock className="h-5 w-32" />
          <div className="mt-4 grid gap-3">
            <SkeletonBlock className="h-3 w-full max-w-sm" />
            <SkeletonBlock className="h-3 w-3/4 max-w-xs" />
          </div>
        </div>
      </section>
    </div>
  );
}
