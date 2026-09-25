"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";
import { NAV } from "./nav";

export function Sidebar({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();
  const allowed = (p?: string) => !p || permissions.includes("*") || permissions.includes(p);
  const isActive = (href: string) => (href === "/finance" ? pathname === "/finance" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <aside className="sticky top-0 hidden h-screen w-[244px] shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <Link href="/finance" className="flex h-14 items-center gap-2.5 border-b border-line px-5">
        <Image src="/brand/icon-b.png" alt="" width={30} height={25} className="h-[22px] w-auto" priority />
        <div className="leading-none">
          <p className="text-[13.5px] font-semibold tracking-[-0.01em]">Move Beyond</p>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">Company OS</p>
        </div>
      </Link>
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {NAV.map((g, gi) => {
          const items = g.items.filter((i) => i.soon || allowed(i.permission));
          if (!items.length) return null;
          return (
            <div key={gi} className={cn(gi > 0 && "mt-4")}>
              {g.title && <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-4">{g.title}</p>}
              {items.map((i) => {
                const Icon = i.icon;
                if (i.soon) {
                  return (
                    <span key={i.label} className="flex cursor-default items-center gap-2.5 rounded-lg px-2 py-[5px] text-[13.5px] text-ink-4" title="Future module">
                      <Icon className="size-4" /> {i.label}
                      <span className="ml-auto rounded bg-muted px-1.5 py-px text-[10px] font-medium uppercase tracking-wide">Soon</span>
                    </span>
                  );
                }
                const active = isActive(i.href);
                return (
                  <Link key={i.href} href={i.href}
                    className={cn("flex items-center gap-2.5 rounded-lg px-2 py-[5px] text-[13.5px] transition-colors",
                      active ? "bg-muted font-medium text-ink" : "text-ink-2 hover:bg-subtle hover:text-ink")}>
                    <Icon className={cn("size-4", active ? "text-ink" : "text-ink-3")} /> {i.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
