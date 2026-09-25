import Image from "next/image";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/finance";
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-[380px]">
        <Image src="/brand/wordmark-b.png" alt="Move Beyond" width={188} height={60} className="mx-auto mb-8 h-10 w-auto" priority />
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
          <h1 className="text-lg font-semibold tracking-[-0.01em]">Sign in to Company OS</h1>
          <p className="mt-1 text-[13px] text-ink-3">Access is by invitation only.</p>
          <LoginForm next={next} />
        </div>
        <p className="mt-6 text-center text-[12px] text-ink-4">Move Beyond · Internal platform</p>
      </div>
    </div>
  );
}
