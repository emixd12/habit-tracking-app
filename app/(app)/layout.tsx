import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentUserClaims } from "@/lib/auth/current-user";
import { buildLoginPath } from "@/lib/auth/redirects";
import { measurePerformanceSpan } from "@/lib/services/performance-timing";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const {
    userId,
    displayName,
    email,
  } = await measurePerformanceSpan(
    {
      route: "app_layout",
      span: "auth.get_current_user_claims",
    },
    () => getCurrentUserClaims(),
  );

  if (!userId) {
    redirect(buildLoginPath());
  }

  return <AppShell user={{ name: displayName, email }}>{children}</AppShell>;
}
