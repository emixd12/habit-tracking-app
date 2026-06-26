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
    "product-action product-action-primary min-h-12 gap-6 py-2 text-xl leading-7 sm:text-2xl min-[900px]:gap-7";

  if (disabled) {
    return (
      <div className="grid justify-items-start gap-3">
        <button type="button" disabled className={className}>
          <LogIn aria-hidden="true" size={30} strokeWidth={1.75} />
          Continue with Google
        </button>
      </div>
    );
  }

  return (
    <div className="grid justify-items-start gap-3">
      <a href={href} className={className}>
        <LogIn aria-hidden="true" size={30} strokeWidth={1.75} />
        Continue with Google
      </a>
    </div>
  );
}
