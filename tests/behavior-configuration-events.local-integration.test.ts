import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";

import { listBehaviorConfigurationEvents } from "../lib/db/behaviorConfigurationEvents.repo";

const localUrl = process.env.CADENCE_LOCAL_SUPABASE_URL;
const localServiceKey = process.env.CADENCE_LOCAL_SUPABASE_SERVICE_KEY;
const localUserId = process.env.CADENCE_LOCAL_HISTORY_USER_ID;
const localIntegration =
  localUrl && localServiceKey && localUserId ? it : it.skip;

localIntegration(
  "reads a second same-timestamp keyset page through local PostgREST",
  async () => {
    const supabase = createClient(localUrl!, localServiceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const events = await listBehaviorConfigurationEvents(
      supabase,
      localUserId!,
    );

    expect(events).toHaveLength(1_001);
    expect(events[0]?.id).toBe("00000000-0000-4000-8000-000000000001");
    expect(events.at(-1)?.id).toBe(
      "00000000-0000-4000-8000-000000001001",
    );
  },
);
