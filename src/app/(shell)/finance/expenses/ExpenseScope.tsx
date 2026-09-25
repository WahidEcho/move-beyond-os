"use client";
import { useRouter } from "next/navigation";
export function ExpenseScope({ scope }: { scope: string }) {
  const router = useRouter();
  return (
    <select value={scope} onChange={(e) => router.push(`?scope=${e.target.value}`)} className="h-8 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink-2">
      <option value="all">All expenses</option><option value="projects">Project costs</option><option value="overhead">Company overhead</option>
    </select>
  );
}
