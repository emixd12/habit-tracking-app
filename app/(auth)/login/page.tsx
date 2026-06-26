import type { Metadata } from "next";
import Image from "next/image";
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
    <main className="min-h-dvh overflow-hidden bg-background text-foreground">
      <section className="relative mx-auto min-h-dvh w-full max-w-[1505px] overflow-hidden px-10 py-20 sm:px-14 min-[900px]:px-0 min-[900px]:py-0">
        <Image
          src="/brand/cadence-login-horse-composition-blue.png"
          alt=""
          aria-hidden="true"
          width={855}
          height={1045}
          sizes="(min-width: 1024px) 82dvh, 62dvh"
          className="pointer-events-none absolute bottom-[-6dvh] left-1/2 h-[58dvh] w-auto max-w-none -translate-x-[56%] opacity-[0.72] min-[900px]:bottom-auto min-[900px]:left-auto min-[900px]:right-0 min-[900px]:top-0 min-[900px]:h-full min-[900px]:translate-x-0 min-[900px]:opacity-100"
          priority
        />

        <div className="relative z-10 mx-auto mt-[5dvh] flex w-full max-w-[18rem] flex-col items-start min-[900px]:absolute min-[900px]:left-[15.25%] min-[900px]:top-[37%] min-[900px]:mx-0 min-[900px]:mt-0 min-[900px]:max-w-none">
          <h1 className="flex items-center gap-5 text-3xl leading-tight sm:text-4xl min-[900px]:gap-8 min-[900px]:text-6xl">
            <Image
              src="/brand/cadence-logo.png"
              alt=""
              aria-hidden="true"
              width={56}
              height={56}
              sizes="(min-width: 1024px) 56px, 40px"
              className="h-10 w-10 shrink-0 object-contain min-[900px]:h-16 min-[900px]:w-16"
              priority
            />
            <span>Cadence</span>
          </h1>

          <div className="mt-16 grid w-full gap-4 min-[900px]:mt-[5.5rem]">
            {authErrorMessage ? (
              <p className="max-w-[18rem] text-sm leading-6 text-accent">
                {authErrorMessage}
              </p>
            ) : null}

            {accountDeleted ? (
              <p className="max-w-[18rem] text-sm leading-6 text-foreground">
                Account deleted.
              </p>
            ) : null}

            {!isConfigured ? (
              <p className="max-w-[18rem] text-sm leading-6 text-accent">
                Add Supabase runtime values before signing in locally.
              </p>
            ) : null}

            <GoogleLoginButton disabled={!isConfigured} nextPath={nextPath} />

            {testLoginEnabled ? (
              <div className="mt-4 grid gap-1 text-sm leading-6 text-foreground min-[900px]:mt-5">
                <p>Local QA only.</p>
                <a
                  href={`/auth/test-login?next=${encodeURIComponent(nextPath)}`}
                  className="product-action product-action-primary min-h-10 justify-self-start py-2"
                >
                  Continue as temporary test user
                </a>
              </div>
            ) : null}

            <nav
              aria-label="Public product information"
              className="mt-10 flex flex-wrap gap-x-10 gap-y-2 text-base leading-6 text-foreground min-[900px]:mt-10 min-[900px]:gap-x-8 min-[900px]:text-lg"
            >
              <a
                className="inline-flex min-h-10 items-center py-1 underline-offset-4 hover:underline"
                href="/terms"
              >
                Terms
              </a>
              <a
                className="inline-flex min-h-10 items-center py-1 underline-offset-4 hover:underline"
                href="/privacy"
              >
                Privacy
              </a>
              <a
                className="inline-flex min-h-10 items-center py-1 underline-offset-4 hover:underline"
                href="/trust"
              >
                Trust
              </a>
            </nav>
          </div>
        </div>
      </section>
    </main>
  );
}
