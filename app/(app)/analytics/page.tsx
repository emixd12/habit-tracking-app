import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Behaviors",
};

type AnalyticsRedirectPageProps = Readonly<{
  searchParams?: Promise<{
    range?: string | string[];
    behavior?: string | string[];
    day?: string | string[];
  }>;
}>;

export default async function AnalyticsRedirectPage({
  searchParams,
}: AnalyticsRedirectPageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();
  const range = parseStringParam(params?.range);
  const behavior = parseStringParam(params?.behavior);
  const day = parseStringParam(params?.day);

  if (range) {
    query.set("range", range);
  }

  if (behavior && day) {
    query.set("behavior", behavior);
    query.set("day", day);
  }

  const queryString = query.toString();

  redirect(queryString ? `/behaviors?${queryString}` : "/behaviors");
}

function parseStringParam(value: string | string[] | undefined): string | undefined {
  const rawValue = Array.isArray(value) ? value[0] : value;

  return rawValue || undefined;
}
