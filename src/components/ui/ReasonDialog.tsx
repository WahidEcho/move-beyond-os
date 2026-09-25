"use client";
import { useState } from "react";
import { Dialog } from "./Dialog";
import { Button } from "./Button";
import { Field, Textarea } from "./Field";
import { Callout } from "./Callout";

/** Confirmation that requires a written reason (deletes, reversals, reopen — spec §84–86). */
export function ReasonDialog({ open, onClose, title, description, confirmLabel = "Confirm", danger, onConfirm, pending, error }: {
  open: boolean; onClose: () => void; title: string; description?: React.ReactNode; confirmLabel?: string; danger?: boolean;
  onConfirm: (reason: string) => void; pending?: boolean; error?: string | null;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onClose={onClose} title={title} size="sm"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? "danger" : "primary"} loading={pending} disabled={reason.trim().length < 3} onClick={() => onConfirm(reason.trim())}>{confirmLabel}</Button>
      </>}>
      {description && <div className="mb-3 text-sm text-ink-2">{description}</div>}
      <Field label="Reason" required hint="Recorded in the audit log.">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice by mistake" />
      </Field>
      {error && <Callout tone="danger" className="mt-3">{error}</Callout>}
    </Dialog>
  );
}
