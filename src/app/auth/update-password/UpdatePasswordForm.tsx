"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Callout } from "@/components/ui/Callout";

export function UpdatePasswordForm() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="mt-4 space-y-4" onSubmit={async (e) => {
      e.preventDefault(); setPending(true); setError(null);
      const { error } = await createSupabaseBrowser().auth.updateUser({ password: pw });
      setPending(false);
      if (error) setError(error.message); else router.replace("/finance");
    }}>
      <Field label="New password" hint="At least 10 characters.">
        <Input type="password" minLength={10} required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
      </Field>
      {error && <Callout tone="danger">{error}</Callout>}
      <Button variant="primary" className="w-full" loading={pending}>Save password</Button>
    </form>
  );
}
