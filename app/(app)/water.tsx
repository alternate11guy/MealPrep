"use client";
import { useTransition } from "react";
import { Droplet, Minus, Plus } from "lucide-react";
import { addWaterAction } from "@/app/actions/data";

export function WaterTracker({ date, ml, target }: { date: string; ml: number; target: number }) {
  const [pending, start] = useTransition();
  const pct = Math.min(100, (ml / target) * 100);
  return (
    <div className="flex items-center gap-3 rounded-[6px] border hairline bg-card px-3 py-2.5">
      <Droplet size={16} strokeWidth={1.7} className="text-[#4c6f7d]" />
      <div className="min-w-0 flex-1">
        <div className="flex justify-between text-[12.5px]"><span className="text-ink-2">Hydration</span><span className="tnum"><b className="font-medium">{ml ? (ml / 1000).toFixed(2).replace(/0$/, "") : "0"}</b><span className="text-muted"> / {(target / 1000).toFixed(1)} L</span></span></div>
        <div className="mt-1.5 h-[5px] rounded-full bg-[#e3e8e6]"><div className="h-full rounded-full bg-[#4c6f7d] transition-[width] duration-500" style={{ width: `${pct}%` }} /></div>
      </div>
      <button className="btn btn-ghost btn-sm px-2" aria-label="Remove 250 ml" disabled={pending || ml <= 0} onClick={() => start(() => addWaterAction(date, -250))}><Minus size={14} /></button>
      <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(() => addWaterAction(date, 250))}><Plus size={14} />250 ml</button>
    </div>
  );
}
