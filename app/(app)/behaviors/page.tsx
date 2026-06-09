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
      <section className="grid gap-5">
        <div className="border-b border-line pb-4">
          <h2 className="text-2xl font-bold leading-tight">Create behavior</h2>
        </div>
        <BehaviorForm
          mode="create"
          action={createBehaviorAction}
          categories={data.categories}
        />
      </section>

      <BehaviorList
        activeBehaviors={data.activeBehaviors}
        archivedBehaviors={data.archivedBehaviors}
        categories={data.categories}
        updateAction={updateBehaviorAction}
        archiveAction={archiveBehaviorAction}
      />
    </ScreenFrame>
  );
}
