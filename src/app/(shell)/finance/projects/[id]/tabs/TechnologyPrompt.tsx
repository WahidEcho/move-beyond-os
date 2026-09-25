"use client";
import { useState } from "react";
import { Cpu } from "lucide-react";
import { setProjectTechnology } from "@/app/actions/finance";
import { useAction } from "@/components/ui/useAction";
import { Button } from "@/components/ui/Button";
import { AllocateCtoDialog } from "@/components/finance/forms";
import { egp } from "@/lib/format";
import type { Lookups } from "@/services/queries";

/** Spec §51 intelligent notification: this project uses technology with unrecovered CTO value. */
export function TechnologyPrompt({ projectId, technologyId, name, outstanding, developer, lookups }: {
  projectId: string; technologyId: string; name?: string; outstanding: number; developer?: string; lookups: Lookups;
}) {
  const [open, setOpen] = useState(false);
  const decide = useAction(setProjectTechnology, { success: "Saved" });
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3.5 animate-slide-up">
      <Cpu className="size-5 text-warn" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">This project uses {name}</p>
        <p className="text-ink-2">Outstanding CTO development recovery: <b className="num">{egp(outstanding)}</b> · Developer: {developer}. Allocate a recovery amount from this project?</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={() => setOpen(true)}>Add recovery</Button>
        <Button size="sm" loading={decide.pending} onClick={() => decide.run(projectId, technologyId, "decide_at_settlement", null)}>Decide during settlement</Button>
        <Button size="sm" variant="ghost" onClick={() => decide.run(projectId, technologyId, "no_recovery", null)}>No recovery from this project</Button>
      </div>
      {open && <AllocateCtoDialog open onClose={() => setOpen(false)} lookups={lookups} projectId={projectId} technologyId={technologyId}
        outstanding={outstanding} techName={name} developer={developer} />}
    </div>
  );
}
