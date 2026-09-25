"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Cpu, FilePlus2, HandCoins, Package, PiggyBank, Plus, Receipt, Repeat, Scale, FileClock, Percent } from "lucide-react";
import type { Lookups } from "@/services/queries";
import { ExpenseDialog } from "./ExpenseForm";
import { AllocateCtoDialog, CollectionDialog, FeeDialog, FundingDialog, SubscriptionDialog, TechnologyDialog } from "./forms";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { ProjectSelect } from "./pickers";

type Key = "expense" | "commitment" | "collection" | "funding" | "fee" | "tech" | "cto" | "subscription" | "asset" | "settlement";

/** Spec §107 quick actions. Each opens the same form used elsewhere. */
export function QuickActions({ lookups, can }: { lookups: Lookups; can: Record<string, boolean> }) {
  const router = useRouter();
  const [open, setOpen] = useState<Key | null>(null);
  const [project, setProject] = useState("");
  const close = () => setOpen(null);
  const items: { key: Key | "project"; label: string; icon: React.ComponentType<{ className?: string }>; show: boolean }[] = [
    { key: "project", label: "New project", icon: FilePlus2, show: can.projects },
    { key: "expense", label: "Add expense", icon: Receipt, show: can.finance },
    { key: "collection", label: "Record client payment", icon: HandCoins, show: can.finance },
    { key: "commitment", label: "Add commitment", icon: FileClock, show: can.finance },
    { key: "funding", label: "Add funding", icon: PiggyBank, show: can.finance },
    { key: "fee", label: "Add partner fee", icon: Percent, show: can.finance },
    { key: "tech", label: "Add CTO development", icon: Cpu, show: can.tech },
    { key: "cto", label: "Allocate CTO recovery", icon: Banknote, show: can.techRecover },
    { key: "subscription", label: "Create subscription", icon: Repeat, show: can.subscriptions },
    { key: "asset", label: "Add asset", icon: Package, show: can.finance },
    { key: "settlement", label: "Start settlement", icon: Scale, show: can.settlements },
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
        {items.filter((i) => i.show).map((i) => {
          const Icon = i.icon;
          return (
            <button key={i.key} onClick={() => (i.key === "project" ? router.push("/finance/projects/new") : setOpen(i.key as Key))}
              className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-left text-[13px] font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink">
              <Icon className="size-4 shrink-0 text-ink-3" /> <span className="truncate">{i.label}</span>
            </button>
          );
        })}
      </div>
      {open === "expense" && <ExpenseDialog open onClose={close} lookups={lookups} />}
      {open === "commitment" && <ExpenseDialog open onClose={close} lookups={lookups} initialMode="commitment" title="Add commitment" />}
      {open === "asset" && <ExpenseDialog open onClose={close} lookups={lookups} initialType="owned_asset" title="Add asset (purchase)" />}
      {open === "collection" && <CollectionDialog open onClose={close} lookups={lookups} />}
      {open === "funding" && <FundingDialog open onClose={close} lookups={lookups} />}
      {open === "fee" && <FeeDialog open onClose={close} lookups={lookups} />}
      {open === "tech" && <TechnologyDialog open onClose={close} lookups={lookups} />}
      {open === "cto" && <AllocateCtoDialog open onClose={close} lookups={lookups} />}
      {open === "subscription" && <SubscriptionDialog open onClose={close} lookups={lookups} />}
      {open === "settlement" && (
        <Dialog open onClose={close} title="Start settlement" size="sm"
          footer={<><Button variant="ghost" onClick={close}>Cancel</Button>
            <Button variant="primary" disabled={!project} onClick={() => router.push(`/finance/projects/${project}?tab=settlement`)}><Plus className="size-4" />Open settlement</Button></>}>
          <Field label="Project"><ProjectSelect lookups={lookups} value={project} onChange={setProject} /></Field>
        </Dialog>
      )}
    </>
  );
}
