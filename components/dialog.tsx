"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/util";

export function Dialog({ open, onClose, title, children, wide, footer }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean; footer?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-ink/35 backdrop-blur-[1px]" aria-label="Close dialog" onClick={onClose} tabIndex={-1} />
      <div ref={ref} tabIndex={-1} className={cn("relative flex max-h-[92dvh] w-full flex-col rounded-t-[14px] bg-paper shadow-[0_20px_60px_-20px_rgba(31,33,28,0.35)] outline-none rise sm:rounded-[10px]", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <div className="flex items-center justify-between border-b hairline px-5 py-3.5">
          <h2 className="display text-[21px]">{title}</h2>
          <button className="btn btn-ghost btn-sm -mr-2" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t hairline px-5 py-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:pb-3">{footer}</div>}
      </div>
    </div>
  );
}

export function useErrorToast() {
  return (e: unknown) => {
    const msg = e instanceof Error ? e.message : "Something went wrong.";
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("mise:toast", { detail: { msg, tone: "error" } }));
  };
}

export function toast(msg: string, tone: "ok" | "error" = "ok") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("mise:toast", { detail: { msg, tone } }));
}
