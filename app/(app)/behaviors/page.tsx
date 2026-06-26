import type { Metadata } from "next";
import { Suspense } from "react";

import { BehaviorCreateSection } from "@/components/behaviors/BehaviorCreateSection";
import { BehaviorList } from "@/components/behaviors/BehaviorList";
import {
  ScreenContentLoading,
  ScreenFrame,
} from "@/components/layout/ScreenFrame";
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

export default function BehaviorsPage() {
  return (
    <ScreenFrame title="Behaviors">
      <Suspense fallback={<ScreenContentLoading label="Loading behaviors" />}>
        <BehaviorsContent />
      </Suspense>
    </ScreenFrame>
  );
}

async function BehaviorsContent() {
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
    <>
      <BehaviorCreateSection
        action={createBehaviorAction}
        categories={data.categories}
        defaultTimezone={data.defaultTimezone}
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
    </>
  );
}
