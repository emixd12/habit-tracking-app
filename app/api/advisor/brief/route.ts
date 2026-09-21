import { dailyBriefPreflight, readDailyBriefRequestBody, runDailyBriefRequest } from "@/lib/services/daily-brief-request";
import { requestInAppDailyBrief } from "@/lib/services/daily-brief.service";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export function POST(request: Request) {
  return runDailyBriefRequest(request, async (caller) => requestInAppDailyBrief(caller, await readDailyBriefRequestBody(request)));
}
export const OPTIONS = dailyBriefPreflight;
