"use client";

import { useEffect, useState, useTransition } from "react";
import { Dialog, toast, useErrorToast } from "./dialog";
import { RecipePhoto } from "./photo";
import { replaceMealAction, replacementOptionsAction } from "@/app/actions/plan";
import { cn } from "@/lib/util";

type Option = Awaited<ReturnType<typeof replacementOptionsAction>>[number];

const PROTEINS = [
  { id: "", label: "Any" }, { id: "chicken", label: "Chicken" }, { id: "turkey", label: "Turkey" }, { id: "beef", label: "Beef" },
  { id: "shrimp", label: "Shrimp" }, { id: "white-fish", label: "White fish" }, { id: "salmon", label: "Salmon" }, { id: "tuna", label: "Tuna" }, { id: "egg", label: "Egg" },
];

export function ReplaceDialog({ open, onClose, weekId, date, mealId, currentTitle }: { open: boolean; onClose: () => void; weekId: string; date: string; mealId: string; currentTitle: string }) {
  const [protein, setProtein] = useState("");
  const [opts, setOpts] = useState<Option[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, start] = useTransition();
  const onError = useErrorToast();

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    replacementOptionsAction(weekId, date, mealId, protein || undefined)
      .then((o) => alive && setOpts(o))
      .catch((e) => alive && onError(e))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, protein, weekId, date, mealId]);

  const apply = (o: Option, withChanges: boolean) => start(async () => {
    try {
      await replaceMealAction(weekId, date, mealId, o.recipeId, o.servings, withChanges ? o.changes.map((c) => ({ mealId: c.mealId, to: c.to })) : []);
      toast(`Replaced with ${o.title}`);
      onClose();
    } catch (e) { onError(e); }
  });

  return (
    <Dialog open={open} onClose={onClose} title="Replace meal" wide>
      <p className="text-[13px] text-muted">Replacing <span className="text-ink">{currentTitle}</span>. Each option is re-balanced with the rest of the day, so portions may shift to keep your targets.</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {PROTEINS.map((p) => <button key={p.id} className={cn("chip", protein === p.id && "chip-on")} onClick={() => setProtein(p.id)}>{p.label}</button>)}
      </div>
      <div className="mt-4 space-y-3">
        {loading && <p className="py-8 text-center text-[13px] text-muted">Re-balancing options…</p>}
        {!loading && opts?.length === 0 && <p className="py-8 text-center text-[13px] text-muted">No recipes with that protein fit this slot.</p>}
        {!loading && opts?.map((o) => (
          <div key={o.recipeId} className="grid grid-cols-[84px_1fr] gap-3 rounded-[8px] border hairline bg-card p-2.5">
            <RecipePhoto photo={o.photo} title={o.title} className="aspect-square w-full rounded-[5px]" credit={false} small />
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="display text-[16px] leading-snug">{o.title}</p>
                <span className={cn("shrink-0 text-[11px] font-medium", o.satisfied ? "text-forest-2" : "text-clay")}>{o.satisfied ? "Day stays on target" : "Day off target"}</span>
              </div>
              <p className="tnum mt-1 text-[12px] text-muted">
                {o.servings} serving{o.servings === 1 ? "" : "s"} · {Math.round(o.perServing.kcal * o.servings)} kcal · P {Math.round(o.perServing.protein * o.servings)} · C {Math.round(o.perServing.carbs * o.servings)} · F {Math.round(o.perServing.fat * o.servings)}
              </p>
              <p className="tnum mt-0.5 text-[11.5px] text-muted">Day total: {Math.round(o.totals.kcal)} kcal · P {Math.round(o.totals.protein)} · C {Math.round(o.totals.carbs)} · F {Math.round(o.totals.fat)}
                {o.violations.length > 0 && <span className="text-clay"> ({o.violations.map((v) => `${v.label.toLowerCase()} ${v.by > 0 ? "+" : ""}${Math.round(v.by)}`).join(", ")})</span>}
              </p>
              {o.changes.length > 0 && (
                <p className="mt-1 text-[11.5px] text-ink-2">Suggested portion changes: {o.changes.map((c) => `${c.title} ${c.from} → ${c.to}`).join("; ")}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => apply(o, true)}>{o.changes.length ? "Replace and adjust day" : "Replace"}</button>
                {o.changes.length > 0 && <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => apply(o, false)}>Replace only</button>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
