import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { buildLoginPath } from "@/lib/auth/redirects";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
