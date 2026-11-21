"use client";

import { macroEnergy, targetReference } from "@/lib/nutrition/targets";
import type { Target, TargetMode, Targets } from "@/lib/types";
import { cn } from "@/lib/util";

const ROWS: { key: keyof Targets; label: string; unit: string }[] = [
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbohydrate", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
  { key: "kcal", label: "Energy", unit: "kcal" },
  { key: "fiber", label: "Fibre", unit: "g" },
];

const MODES: { id: TargetMode; label: string }[] = [
  { id: "exact", label: "Exact" }, { id: "min", label: "Minimum" }, { id: "max", label: "Maximum" }, { id: "range", label: "Range" },
];

function num(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function TargetEditor({ value, onChange }: { value: Targets; onChange: (t: Targets) => void }) {
  const set = (k: keyof Targets, t: Target) => onChange({ ...value, [k]: t });
  const fromMacros = macroEnergy({ protein: targetReference(value.protein), carbs: targetReference(value.carbs), fat: targetReference(value.fat) });
  return (
    <div className="space-y-2">
      {ROWS.map(({ key, label, unit }) => {
        const t = value[key] ?? { mode: "min" as const, value: 0 };
        return (
          <div key={key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 rounded-[6px] border hairline bg-card px-3 py-2.5 sm:grid-cols-[120px_1fr_auto]">
            <span className="text-[13px] font-medium">{label}</span>
            <div className="order-3 col-span-2 flex flex-wrap gap-1 sm:order-none sm:col-span-1">
              {MODES.map((m) => (
                <button type="button" key={m.id} onClick={() => set(key, { ...t, mode: m.id, min: t.min ?? Math.round(t.value * 0.9), max: t.max ?? Math.round(t.value * 1.1) })}
                  className={cn("chip", t.mode === m.id && "chip-on")}>{m.label}</button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 justify-self-end">
              {t.mode === "range" ? (
                <>
                  <input aria-label={`${label} minimum`} inputMode="decimal" className="field tnum h-8 w-[68px] text-right" value={t.min ?? ""} onChange={(e) => set(key, { ...t, min: num(e.target.value) })} />
                  <span className="text-muted">–</span>
                  <input aria-label={`${label} maximum`} inputMode="decimal" className="field tnum h-8 w-[68px] text-right" value={t.max ?? ""} onChange={(e) => set(key, { ...t, max: num(e.target.value), value: num(e.target.value) })} />
                </>
              ) : (
                <input aria-label={`${label} target`} inputMode="decimal" className="field tnum h-8 w-[84px] text-right" value={t.value} onChange={(e) => set(key, { ...t, value: num(e.target.value) })} />
              )}
              <span className="w-8 text-[12px] text-muted">{unit}</span>
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-[12px] text-muted">
        Macros add up to <span className="tnum font-medium text-ink-2">{Math.round(fromMacros)} kcal</span> at 4/4/9 kcal per gram.
        {Math.abs(fromMacros - targetReference(value.kcal)) > 40 && (
          <button type="button" className="ml-2 font-medium text-forest underline underline-offset-4" onClick={() => set("kcal", { ...value.kcal, value: Math.round(fromMacros), min: Math.round(fromMacros * 0.95), max: Math.round(fromMacros * 1.05) })}>Match energy to macros</button>
        )}
      </p>
    </div>
  );
}
