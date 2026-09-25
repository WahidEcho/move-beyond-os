import { UpdatePasswordForm } from "./UpdatePasswordForm";
export const metadata = { title: "Set password" };
export default function Page() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[380px] rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
        <h1 className="text-lg font-semibold">Set your password</h1>
        <UpdatePasswordForm />
      </div>
    </div>
  );
}
