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
    "product-action product-action-primary min-h-12 w-full gap-3 py-3 text-sm font-bold";

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
