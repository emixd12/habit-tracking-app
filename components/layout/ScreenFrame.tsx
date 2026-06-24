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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
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
    <section className="border-y border-line bg-background py-5 sm:py-6">
      <h2 className="text-xl font-bold leading-tight">{title}</h2>
      <div className="mt-4 text-base leading-7 text-muted-readable">
        {children}
      </div>
    </section>
  );
}
