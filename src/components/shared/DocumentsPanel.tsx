"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Upload } from "lucide-react";
import { documentUrl, uploadDocument } from "@/app/actions/masterdata";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { dateTime, humanize } from "@/lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any */
const TYPES = ["invoice", "receipt", "quotation", "contract", "bank_transfer_proof", "purchase_order", "development_scope", "technical_proposal", "signed_agreement", "photo", "other"];

/** Optional attachments for any record (spec §91). */
export function DocumentsPanel({ entityType, entityId, docs }: { entityType: string; entityId: string; docs: any[] }) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState("invoice");
  const [pending, start] = useTransition();
  const upload = (file: File) => start(async () => {
    const fd = new FormData();
    fd.set("file", file); fd.set("entity_type", entityType); fd.set("entity_id", entityId); fd.set("doc_type", docType);
    const r = await uploadDocument(fd);
    if (r.ok) { toast({ tone: "success", title: "Document uploaded" }); router.refresh(); } else toast({ tone: "error", title: "Upload failed", body: r.error });
  });
  return (
    <Card>
      <CardHeader title="Documents" subtitle="Invoices, receipts, contracts, transfer proofs…" actions={<>
        <Select className="h-8 w-48" value={docType} onChange={(e) => setDocType(e.target.value)}>{TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select>
        <Button size="sm" variant="primary" loading={pending} onClick={() => input.current?.click()}><Upload className="size-3.5" />Upload</Button>
        <input ref={input} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
      </>} />
      {docs.length === 0 ? <EmptyState title="No documents" body="Attachments are optional." icon={<FileText className="size-6" />} /> : (
        <ul className="divide-y divide-line">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-5 py-2.5 text-[13.5px]">
              <FileText className="size-4 text-ink-3" />
              <button className="font-medium hover:underline" onClick={async () => { const u = await documentUrl(d.storage_path); if (u) window.open(u, "_blank"); }}>{d.file_name}</button>
              <span className="text-[12px] text-ink-3">{humanize(d.doc_type)}</span>
              <span className="ml-auto text-[12px] text-ink-3">{dateTime(d.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
