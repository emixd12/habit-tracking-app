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
    "product-action product-action-primary min-h-12 !gap-4 py-2 text-lg leading-6 min-[900px]:!gap-7 min-[900px]:text-2xl min-[900px]:leading-7";

  if (disabled) {
    return (
      <div className="grid w-fit justify-self-center justify-items-start gap-3">
        <button type="button" disabled className={className}>
          <LogIn
            aria-hidden="true"
            className="h-7 w-7 min-[900px]:h-9 min-[900px]:w-9"
            strokeWidth={1.6}
          />
          Continue with Google
        </button>
      </div>
    );
  }

  return (
    <div className="grid w-fit justify-self-center justify-items-start gap-3">
      <a href={href} className={className}>
        <LogIn
          aria-hidden="true"
          className="h-7 w-7 min-[900px]:h-9 min-[900px]:w-9"
          strokeWidth={1.6}
        />
        Continue with Google
      </a>
    </div>
  );
}
