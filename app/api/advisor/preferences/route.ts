import { dailyBriefPreflight, readDailyBriefRequestBody, runDailyBriefRequest } from "@/lib/services/daily-brief-request";
import { getDailyBriefSettings, updateDailyBriefSettings } from "@/lib/services/daily-brief.service";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return runDailyBriefRequest(request, getDailyBriefSettings); }
export function PUT(request: Request) {
  return runDailyBriefRequest(request, async (caller) => updateDailyBriefSettings(caller, await readDailyBriefRequestBody(request)));
}
export const OPTIONS = dailyBriefPreflight;
