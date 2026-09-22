import { readBriefingWorkbenchAccount, runBriefingComparison } from "@/lib/services/briefing-workbench.service";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export function POST(request: Request) { return runBriefingComparison(request); }
export function GET(request: Request) { return readBriefingWorkbenchAccount(request); }
