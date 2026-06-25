import type { Metadata } from "next";
import {
  getAuthErrorMessage,
  normalizeRedirectPath,
} from "@/lib/auth/redirects";
import { DEFAULT_APP_ROUTE } from "@/lib/navigation";
import { readSupabaseRuntimeConfig } from "@/lib/supabase/env";
import { shouldShowTestLogin } from "@/lib/auth/test-login";
import { GoogleLoginButton } from "./GoogleLoginButton";

export const metadata: Metadata = {
  title: "Sign in",
};

type LoginPageProps = Readonly<{
  searchParams: Promise<{
    account_deleted?: string | string[];
    error?: string | string[];
    next?: string | string[];
  }>;
}>;

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = normalizeRedirectPath(params.next, DEFAULT_APP_ROUTE);
  const authErrorMessage = getAuthErrorMessage(params.error);
  const accountDeleted = params.account_deleted === "1";
  const isConfigured = readSupabaseRuntimeConfig() !== null;
  const testLoginEnabled = shouldShowTestLogin();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground sm:px-6">
      <section className="w-full max-w-xl border-y border-line bg-background py-6 sm:py-8">
        <div className="border-b border-line pb-6">
          <p className="text-sm font-bold text-muted-readable">
            Private behavior ledger
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
            Cadence Tracker
          </h1>
          <p className="mt-4 max-w-prose text-base leading-7 text-muted-readable">
            Sign in with Google to open your Timeline.
          </p>
        </div>

        <div className="grid gap-5 pt-6">
          {authErrorMessage ? (
            <p className="border-t border-line pt-4 text-sm leading-6 text-accent">
              {authErrorMessage}
            </p>
          ) : null}

          {accountDeleted ? (
            <p className="border-t border-line pt-4 text-sm leading-6 text-muted-readable">
              Account deleted.
            </p>
          ) : null}

          {!isConfigured ? (
            <p className="border-t border-line pt-4 text-sm leading-6 text-muted-readable">
              Add Supabase runtime values before signing in locally.
            </p>
          ) : null}

          <GoogleLoginButton disabled={!isConfigured} nextPath={nextPath} />

          {testLoginEnabled ? (
            <div className="border-t border-line pt-4 text-sm leading-6 text-muted-readable">
              <p>Local QA only.</p>
              <a
                href={`/auth/test-login?next=${encodeURIComponent(nextPath)}`}
                className="product-action product-action-secondary mt-2 min-h-10 py-2"
              >
                Continue as temporary test user
              </a>
            </div>
          ) : null}

          <p className="text-sm leading-6 text-muted-readable">
            Google sign-in is required for Cadence.
          </p>

          <nav
            aria-label="Public product information"
            className="flex flex-wrap gap-3 border-t border-line pt-4 text-sm leading-6 text-muted-readable"
          >
            <a className="product-action product-action-secondary" href="/terms">
              Terms
            </a>
            <a className="product-action product-action-secondary" href="/privacy">
              Privacy
            </a>
            <a className="product-action product-action-secondary" href="/trust">
              Trust
            </a>
          </nav>
        </div>
      </section>
    </main>
  );
}
