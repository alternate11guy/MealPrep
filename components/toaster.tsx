"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/util";

export function Toaster() {
  const [items, setItems] = useState<{ id: number; msg: string; tone: string }[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { msg: string; tone: string };
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { id, ...d }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), d.tone === "error" ? 7000 : 3500);
    };
    window.addEventListener("mise:toast", on);
    return () => window.removeEventListener("mise:toast", on);
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6">
      {items.map((t) => (
        <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className={cn("pointer-events-auto max-w-md rounded-[6px] px-4 py-2.5 text-[13px] shadow-lg rise", t.tone === "error" ? "bg-clay text-white" : "bg-forest text-ivory")}>{t.msg}</div>
      ))}
    </div>
  );
}
