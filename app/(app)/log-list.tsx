"use client";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteLogAction } from "@/app/actions/data";
import { SLOT_LABEL } from "@/lib/util";
import type { FoodLogEntry, Nutrients } from "@/lib/types";

const METHOD: Record<string, string> = { manual: "Manual", text: "Described", photo: "Photo estimate", barcode: "Barcode", restaurant: "Restaurant", recipe: "Recipe" };

export function LogList({ entries }: { entries: (FoodLogEntry & { t: Nutrients })[] }) {
  const [pending, start] = useTransition();
  return (
    <ul className="divide-y divide-line rounded-[8px] border hairline bg-card">
      {entries.map((e) => (
        <li key={e.id} className="flex items-center gap-3 px-3.5 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px]">{e.name}</p>
            <p className="text-[11.5px] text-muted">{SLOT_LABEL[e.slot]} · {METHOD[e.method]}{e.estimated && " · estimate"}{e.demo && " · demo"}</p>
          </div>
          <p className="tnum text-right text-[12px] text-ink-2">{Math.round(e.t.kcal)} kcal<span className="block text-[11px] text-muted">P {Math.round(e.t.protein)} · C {Math.round(e.t.carbs)} · F {Math.round(e.t.fat)}</span></p>
          <button className="btn btn-ghost btn-sm px-2" aria-label={`Delete ${e.name}`} disabled={pending} onClick={() => start(() => deleteLogAction(e.id))}><Trash2 size={14} /></button>
        </li>
      ))}
    </ul>
  );
}
