import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { ToastProvider } from "@/components/ui/Toast";
import { requireSession } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase/server";

export default async function ShellLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();
  const supabase = await createSupabaseServer();
  const { count } = await supabase.from("v_my_alerts").select("id", { count: "exact", head: true })
    .eq("organization_id", session.orgId).in("priority", ["critical", "high"]).is("read_at", null);

  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <Sidebar permissions={session.permissions} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar orgName={session.orgName} orgs={session.orgs} orgId={session.orgId}
            userLabel={session.personName ?? session.email ?? "User"} alertCount={count ?? 0} />
          <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
