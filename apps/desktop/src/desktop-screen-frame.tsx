import type { ReactNode } from "react";

export function DesktopScreenFrame({
  title,
  children,
}: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <div className="flex w-full flex-col">
      <div className="w-full overflow-hidden bg-background pt-1">
        {/* Native builds bundle this image without a Next server. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/cadence-page-banner-lines-dots.png"
          width={1965}
          height={64}
          alt=""
          aria-hidden="true"
          className="block h-auto w-full"
        />
      </div>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <header className="border-b border-line pb-6">
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
            {title}
          </h1>
        </header>
        {children}
      </div>
    </div>
  );
}
