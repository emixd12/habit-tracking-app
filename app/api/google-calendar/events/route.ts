import { getCalendarEvents } from "@/lib/services/google-calendar.service";
import { calendarPreflight, runCalendarRequest } from "@/lib/services/google-calendar-request";
export const OPTIONS = calendarPreflight;
export function GET(request: Request) {
  const url = new URL(request.url);
  return runCalendarRequest(request, (caller) => getCalendarEvents(caller, url.searchParams.get("start") ?? "", url.searchParams.get("end") ?? ""));
}
