import Image from "next/image";

const CADENCE_PAGE_BANNER_IMAGE = {
  src: "/brand/cadence-page-banner-lines-dots.png",
  width: 1965,
  height: 64,
} as const;

export function CadencePageBanner() {
  return (
    <div className="w-full overflow-hidden bg-background pt-1">
      <Image
        src={CADENCE_PAGE_BANNER_IMAGE.src}
        alt=""
        aria-hidden="true"
        width={CADENCE_PAGE_BANNER_IMAGE.width}
        height={CADENCE_PAGE_BANNER_IMAGE.height}
        priority
        sizes="100vw"
        className="block h-auto w-full"
      />
    </div>
  );
}

export function ScreenFrame({
  title,
  description,
  children,
}: Readonly<{
  title: string;
  description?: string;
  children: React.ReactNode;
}>) {
  return (
    <div className="flex w-full flex-col">
      <CadencePageBanner />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <header className="border-b border-line pb-6">
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-3 max-w-3xl text-base leading-7 text-muted-readable">
              {description}
            </p>
          ) : null}
        </header>
        {children}
      </div>
    </div>
  );
}

export function PlaceholderPanel({
  title,
  children,
}: Readonly<{
  title: string;
  children: React.ReactNode;
}>) {
  return (
    <section className="bg-background py-4 first:pt-0 last:pb-0">
      <h2 className="text-xl font-bold leading-tight">{title}</h2>
      <div className="mt-4 text-base leading-7 text-muted-readable">
        {children}
      </div>
    </section>
  );
}

export function ScreenContentLoading({
  label = "Loading screen content",
}: Readonly<{
  label?: string;
}>) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="grid gap-12"
    >
      <span className="sr-only">{label}</span>

      <section aria-hidden="true" className="py-4 first:pt-0">
        <SkeletonBlock className="h-5 w-36" />
        <div className="mt-4 grid gap-3">
          <SkeletonBlock className="h-3 w-full max-w-2xl" />
          <SkeletonBlock className="h-3 w-5/6 max-w-xl" />
          <SkeletonBlock className="h-3 w-2/3 max-w-md" />
        </div>
      </section>

      <section aria-hidden="true" className="grid divide-y divide-line">
        {["w-3/4", "w-2/3", "w-5/6"].map((width) => (
          <div key={width} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="grid gap-2">
              <SkeletonBlock className={["h-4 max-w-full", width].join(" ")} />
              <SkeletonBlock className="h-3 w-40 max-w-[70%]" />
            </div>
            <div className="flex flex-wrap gap-4 sm:justify-end">
              <SkeletonBlock className="h-3 w-20" />
              <SkeletonBlock className="h-3 w-24" />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function SkeletonBlock({ className }: Readonly<{ className: string }>) {
  return (
    <span
      aria-hidden="true"
      className={["block bg-surface", className].join(" ")}
    />
  );
}
