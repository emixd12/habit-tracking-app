import { redirect } from "next/navigation";
import { DEFAULT_APP_ROUTE } from "@/lib/navigation";

export default function HomePage() {
  redirect(DEFAULT_APP_ROUTE);
}
