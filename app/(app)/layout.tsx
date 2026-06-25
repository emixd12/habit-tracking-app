import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentUser } from "@/lib/auth/current-user";
import { buildLoginPath } from "@/lib/auth/redirects";
import { measurePerformanceSpan } from "@/lib/services/performance-timing";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const {
    user,
  } = await measurePerformanceSpan(
    {
      route: "app_layout",
      span: "auth.get_current_user",
    },
    () => getCurrentUser(),
  );

  if (!user) {
    redirect(buildLoginPath());
  }

  const metadata = user.user_metadata as Record<string, unknown>;
  const fullName =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
        ? metadata.name
        : null;

  return (
    <AppShell user={{ name: fullName, email: user.email ?? null }}>
      {children}
    </AppShell>
  );
}
