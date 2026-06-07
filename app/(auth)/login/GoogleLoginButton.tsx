"use client";

import { LogIn } from "lucide-react";
import { useState } from "react";
import { AUTH_CALLBACK_ROUTE } from "@/lib/auth/redirects";
import { createClient } from "@/lib/supabase/client";

export function GoogleLoginButton({
  disabled = false,
  nextPath,
}: Readonly<{
  disabled?: boolean;
  nextPath: string;
}>) {
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSignIn() {
    setIsPending(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const redirectTo = new URL(AUTH_CALLBACK_ROUTE, window.location.origin);
      redirectTo.searchParams.set("next", nextPath);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectTo.toString(),
        },
      });

      if (error) {
        setErrorMessage(error.message);
        setIsPending(false);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Google sign-in could not start.",
      );
      setIsPending(false);
    }
  }

  return (
    <div className="grid gap-3">
      <button
        type="button"
        disabled={disabled || isPending}
        onClick={handleSignIn}
        className="inline-flex min-h-12 w-full items-center justify-center gap-3 border-2 border-foreground bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-foreground disabled:border-line disabled:bg-surface disabled:text-muted-readable"
      >
        <LogIn aria-hidden="true" size={18} strokeWidth={2} />
        {isPending ? "Opening Google..." : "Continue with Google"}
      </button>
      {errorMessage ? (
        <p className="text-sm leading-6 text-accent">{errorMessage}</p>
      ) : null}
    </div>
  );
}
