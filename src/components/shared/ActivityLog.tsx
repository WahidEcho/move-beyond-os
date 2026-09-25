import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { dateTime, humanize } from "@/lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any */
const SKIP = new Set(["updated_at", "created_at", "journal_entry_id", "organization_id", "id"]);

function fmt(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  const s = String(v);
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
}

/** Audit history (spec §87): who, when, what changed, old → new, and why. */
export function ActivityLog({ rows, title = "Activity" }: { rows: any[]; title?: string }) {
  return (
    <Card>
      <CardHeader title={title} subtitle="Every change is recorded with user, time, previous value, new value and reason." />
      {rows.length === 0 ? <EmptyState title="No activity yet" /> : (
        <ul className="divide-y divide-line">
          {rows.map((r) => {
            const fields: string[] = (r.changed_fields ?? []).filter((f: string) => !SKIP.has(f)).slice(0, 6);
            const tone = r.action === "deleted" || r.action.includes("revers") ? "neg" : r.action === "created" ? "pos" : r.action === "override" || r.action === "reopened" ? "warn" : "neutral";
            return (
              <li key={r.id} className="px-5 py-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={tone}>{humanize(r.action)}</Badge>
                  <span className="font-medium">{humanize(r.table_name.replace(/s$/, ""))}</span>
                  <span className="text-ink-3">by {r.user_name}</span>
                  <span className="ml-auto text-[12px] text-ink-3">{dateTime(r.created_at)}</span>
                </div>
                {r.action === "created" && r.new_data && (
                  <p className="mt-1 text-ink-3">{fmt(r.new_data.description ?? r.new_data.name ?? r.new_data.label ?? r.new_data.reference ?? "")}
                    {r.new_data.amount ?? r.new_data.committed_amount ? ` · ${fmt(r.new_data.amount ?? r.new_data.committed_amount)}` : ""}</p>
                )}
                {fields.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {fields.map((f) => (
                      <p key={f} className="num text-ink-2"><span className="text-ink-3">{humanize(f)}:</span> {fmt(r.old_data?.[f])} → <b>{fmt(r.new_data?.[f])}</b></p>
                    ))}
                  </div>
                )}
                {r.reason && <p className="mt-1 text-ink-2">Reason: {r.reason}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
