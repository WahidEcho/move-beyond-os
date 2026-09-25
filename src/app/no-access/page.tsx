import Link from "next/link";
export const metadata = { title: "No access" };
export default function NoAccess() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold">You don’t have access to this</h1>
        <p className="mt-2 text-sm text-ink-3">Your account isn’t linked to this area of Move Beyond OS yet. Ask Belal or Wahid to grant access.</p>
        <Link href="/finance" className="mt-4 inline-block text-sm font-medium underline">Back to Finance</Link>
      </div>
    </div>
  );
}
