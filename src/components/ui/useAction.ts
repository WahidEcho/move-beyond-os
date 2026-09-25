"use client";
import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/actions";
import { useToast } from "./Toast";

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/**
 * Runs a server action with an idempotency key that stays the same until the
 * action succeeds (so a double-click or retry never records twice), surfaces
 * errors, and refreshes the page data on success. Never fails silently.
 */
export function useAction<A extends unknown[], T>(
  action: (...args: [...A, string]) => Promise<ActionResult<T>>,
  opts: { success?: string | ((data: T) => string); onSuccess?: (data: T) => void; refresh?: boolean } = {},
) {
  const router = useRouter();
  const toast = useToast();
  const key = useRef(newKey());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<Extract<ActionResult, { ok: false }> | null>(null);

  const run = useCallback(
    (...args: A) =>
      new Promise<ActionResult<T>>((resolve) => {
        setError(null);
        startTransition(async () => {
          let res: ActionResult<T>;
          try {
            res = await action(...args, key.current);
          } catch {
            res = { ok: false, kind: "network", error: "Network error — nothing was saved. Try again." };
          }
          if (res.ok) {
            key.current = newKey();
            if (opts.success) toast({ tone: "success", title: typeof opts.success === "function" ? opts.success(res.data) : opts.success });
            opts.onSuccess?.(res.data);
            if (opts.refresh !== false) router.refresh();
          } else {
            setError(res);
            if (res.kind !== "warning") toast({ tone: "error", title: res.kind === "permission" ? "Permission denied" : "Not saved", body: res.error });
          }
          resolve(res);
        });
      }),
    [action, opts, router, toast],
  );
  return { run, pending, error, setError };
}
