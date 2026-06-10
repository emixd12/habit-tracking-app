import type { Metadata } from "next";

import { BehaviorForm } from "@/components/behaviors/BehaviorForm";
import { BehaviorList } from "@/components/behaviors/BehaviorList";
import { ScreenFrame } from "@/components/layout/ScreenFrame";
import { getBehaviorPageData } from "@/lib/services/behavior.service";
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
  const data = await getBehaviorPageData();
  const hasBehaviors =
    data.activeBehaviors.length > 0 || data.archivedBehaviors.length > 0;

  return (
    <ScreenFrame title="Behaviors">
      <section className="border-b border-line">
        <details open={!hasBehaviors}>
          <summary className="cursor-pointer py-4 text-xl font-bold leading-tight marker:text-muted-readable hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Create behavior
          </summary>
          <div className="border-t border-line py-5">
            <BehaviorForm
              mode="create"
              action={createBehaviorAction}
              categories={data.categories}
            />
          </div>
        </details>
      </section>

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
