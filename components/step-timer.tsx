"use client";

import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw, Timer } from "lucide-react";
import { toast } from "./dialog";
import { cn } from "@/lib/util";

/** Countdown for a recipe step. Vibrates (where supported) and toasts when done. */
export function StepTimer({ minutes, large }: { minutes: number; large?: boolean }) {
  const [left, setLeft] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLeft((l) => {
      if (l == null) return l;
      if (l <= 1) {
        setRunning(false);
        try { navigator.vibrate?.(400); } catch {}
        toast(`Timer done (${minutes} min)`);
        return 0;
      }
      return l - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [running, minutes]);
  const shown = left ?? minutes * 60;
  const mm = Math.floor(shown / 60), ss = shown % 60;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border hairline bg-paper px-1 py-0.5", large && "scale-125 origin-left")}>
      <button className="grid size-6 place-items-center rounded-full hover:bg-ink/[0.05]" aria-label={running ? "Pause timer" : "Start timer"}
        onClick={() => { if (left === 0 || left == null) setLeft(minutes * 60); setRunning((v) => !v); }}>
        {running ? <Pause size={12} /> : left === 0 ? <RotateCcw size={12} /> : <Play size={12} />}
      </button>
      <span className={cn("tnum pr-2 text-[12px]", left === 0 && "text-clay")}><Timer size={11} className="mr-1 inline -translate-y-px" />{mm}:{String(ss).padStart(2, "0")}</span>
    </span>
  );
}

