import type { Metadata } from "next";

import { BehaviorForm } from "@/components/behaviors/BehaviorForm";
import { BehaviorList } from "@/components/behaviors/BehaviorList";
import { ScreenFrame } from "@/components/layout/ScreenFrame";
import { getBehaviorPageData } from "@/lib/services/behavior.service";
import {
  archiveBehaviorAction,
  createBehaviorAction,
  updateBehaviorAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Behaviors",
};

export const dynamic = "force-dynamic";

export default async function BehaviorsPage() {
  const data = await getBehaviorPageData();

  return (
    <ScreenFrame title="Behaviors">
      <section className="border-2 border-foreground bg-background p-5 sm:p-6">
        <div className="border-b-2 border-foreground pb-4">
          <h2 className="text-2xl font-bold leading-tight">Create behavior</h2>
        </div>
        <div className="pt-5">
          <BehaviorForm
            mode="create"
            action={createBehaviorAction}
            categories={data.categories}
            defaultTimezone={data.defaultTimezone}
          />
        </div>
      </section>

      <BehaviorList
        activeBehaviors={data.activeBehaviors}
        archivedBehaviors={data.archivedBehaviors}
        categories={data.categories}
        defaultTimezone={data.defaultTimezone}
        updateAction={updateBehaviorAction}
        archiveAction={archiveBehaviorAction}
      />
    </ScreenFrame>
  );
}
