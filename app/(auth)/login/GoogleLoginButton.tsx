import { LogIn } from "lucide-react";

export function GoogleLoginButton({
  disabled = false,
  nextPath,
}: Readonly<{
  disabled?: boolean;
  nextPath: string;
}>) {
  const href = `/auth/google?next=${encodeURIComponent(nextPath)}`;
  const className =
    "inline-flex min-h-12 w-full items-center justify-center gap-3 border border-line bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-foreground disabled:border-line disabled:bg-surface disabled:text-muted-readable";

  if (disabled) {
    return (
      <div className="grid gap-3">
        <button type="button" disabled className={className}>
          <LogIn aria-hidden="true" size={18} strokeWidth={2} />
          Continue with Google
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <a href={href} className={className}>
        <LogIn aria-hidden="true" size={18} strokeWidth={2} />
        Continue with Google
      </a>
    </div>
  );
}
