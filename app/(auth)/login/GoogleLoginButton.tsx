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
    "product-action product-action-primary min-h-11 py-2 text-base font-bold";

  if (disabled) {
    return (
      <button type="button" disabled className={className}>
        <LogIn aria-hidden="true" size={18} strokeWidth={2.5} />
        Continue with Google
      </button>
    );
  }

  return (
    <a href={href} className={className}>
      <LogIn aria-hidden="true" size={18} strokeWidth={2.5} />
      Continue with Google
    </a>
  );
}
