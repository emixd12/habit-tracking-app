import type { Metadata } from "next";

import { BehaviorCreateSection } from "@/components/behaviors/BehaviorCreateSection";
import { BehaviorList } from "@/components/behaviors/BehaviorList";
import { ScreenFrame } from "@/components/layout/ScreenFrame";
import { getBehaviorPageData } from "@/lib/services/behavior.service";
import { withPerformanceRoute } from "@/lib/services/performance-timing";
import {
  archiveBehaviorAction,
  createBehaviorAction,
  restoreBehaviorAction,
  updateBehaviorAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Behaviors",
};

export const dynamic = "force-dynamic";

export default async function BehaviorsPage() {
  const data = await withPerformanceRoute(
    "/behaviors",
    "page.data_load",
    () => getBehaviorPageData(),
    {
      counts: (pageData) => ({
        categories: pageData.categories.length,
        active_behaviors: pageData.activeBehaviors.length,
        archived_behaviors: pageData.archivedBehaviors.length,
      }),
    },
  );
  const hasBehaviors =
    data.activeBehaviors.length > 0 || data.archivedBehaviors.length > 0;

  return (
    <ScreenFrame title="Behaviors">
      <BehaviorCreateSection
        action={createBehaviorAction}
        categories={data.categories}
        defaultOpen={!hasBehaviors}
      />

      <BehaviorList
        activeBehaviors={data.activeBehaviors}
        archivedBehaviors={data.archivedBehaviors}
        categories={data.categories}
        updateAction={updateBehaviorAction}
        archiveAction={archiveBehaviorAction}
        restoreAction={restoreBehaviorAction}
      />
    </ScreenFrame>
  );
}
