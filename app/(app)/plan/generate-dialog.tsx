"use client";

import { useState, useTransition } from "react";
import { Wand2 } from "lucide-react";
import { Dialog, useErrorToast } from "@/components/dialog";
import { TargetEditor } from "@/components/target-editor";
import { Notice } from "@/components/ui";
import { generateWeekAction } from "@/app/actions/plan";
import { cn, formatDay, money, SLOT_LABEL } from "@/lib/util";
import type { MealSlot, Targets } from "@/lib/types";

export interface GenerateDefaults {
  mealsPerDay: number;
  slots: MealSlot[];
  supplements: boolean;
  allowRepeats: boolean;
  cookingSessions: number;
  maxPrepMin?: number;
  weeklyBudget?: number;
  cuisines: string[];
  exclude: string[];
  available: string[];
}

type Result = Awaited<ReturnType<typeof generateWeekAction>>;

const SLOT_SETS: Record<number, MealSlot[]> = {
  2: ["lunch", "dinner"],
  3: ["breakfast", "lunch", "dinner"],
  4: ["breakfast", "lunch", "dinner", "snack"],
  5: ["breakfast", "snack", "lunch", "dinner", "snack"],
  6: ["breakfast", "snack", "lunch", "snack", "dinner", "snack"],
};

function IngredientPicker({ label, value, onChange, catalog, hint }: { label: string; value: string[]; onChange: (v: string[]) => void; catalog: { id: string; name: string }[]; hint?: string }) {
  const [q, setQ] = useState("");
  const matches = q.length > 1 ? catalog.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) && !value.includes(c.id)).slice(0, 6) : [];
  return (
    <div>
      <span className="label">{label}</span>
      {hint && <p className="-mt-0.5 mb-1.5 text-[11.5px] text-muted">{hint}</p>}
      <div className="relative">
        <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search ingredients" />
        {matches.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-[6px] border hairline bg-card shadow-lg">
            {matches.map((m) => <li key={m.id}><button type="button" className="w-full px-3 py-2 text-left text-[13px] hover:bg-ink/[0.04]" onClick={() => { onChange([...value, m.id]); setQ(""); }}>{m.name}</button></li>)}
          </ul>
        )}
      </div>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((id) => <button type="button" key={id} className="chip" onClick={() => onChange(value.filter((x) => x !== id))}>{catalog.find((c) => c.id === id)?.name ?? id} ×</button>)}
        </div>
      )}
    </div>
  );
}

export function GenerateDialog({ open, onClose, weekId, targets, defaults, catalog, cuisines, currency }: {
  open: boolean; onClose: () => void; weekId: string; targets: Targets; defaults: GenerateDefaults; catalog: { id: string; name: string }[]; cuisines: string[]; currency: string;
}) {
  const [t, setT] = useState(targets);
  const [o, setO] = useState(defaults);
  const [showTargets, setShowTargets] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const onError = useErrorToast();
  const up = (p: Partial<GenerateDefaults>) => setO((x) => ({ ...x, ...p }));

  const slots = o.supplements && o.mealsPerDay >= 5 ? [...SLOT_SETS[o.mealsPerDay].slice(0, -1), "supplement" as MealSlot] : SLOT_SETS[o.mealsPerDay];

  const submit = () => start(async () => {
    setResult(null);
    try {
      const r = await generateWeekAction(weekId, {
        targets: t, mealsPerDay: o.mealsPerDay, slots, weeklyBudget: o.weeklyBudget || undefined, available: o.available,
        cuisines: o.cuisines, maxPrepMin: o.maxPrepMin || undefined, cookingSessions: o.cookingSessions, exclude: o.exclude,
        allowRepeats: o.allowRepeats, supplements: o.supplements,
      });
      setResult(r);
    } catch (e) { onError(e); }
  });

  const close = () => { setResult(null); onClose(); };

  return (
    <Dialog open={open} onClose={close} title={result ? "Your week is ready" : "Generate my week"} wide
      footer={result ? <button className="btn btn-primary" onClick={close}>Review the plan</button> : (
        <>
          <button className="btn btn-ghost" onClick={close}>Cancel</button>
          <button className="btn btn-primary" disabled={pending} onClick={submit}><Wand2 size={15} />{pending ? "Planning and validating…" : "Generate my week"}</button>
        </>
      )}>
      {result ? (
        <div className="space-y-4">
          <p className="text-[13.5px] text-ink-2">
            {result.days.filter((d) => d.ok).length} of 7 days meet every target after portion optimisation.
            {result.cost.total > 0 && <> Estimated cost {money(result.cost.total, currency)}{result.cost.coverage < 1 && ` (${Math.round(result.cost.coverage * 100)}% of ingredients priced)`}.</>}
            {result.proposer === "claude" ? " Claude shortlisted the meals; the nutrition engine set every portion." : " The nutrition engine chose meals and set every portion."}
          </p>
          <ul className="divide-y divide-line rounded-[8px] border hairline bg-card">
            {result.days.map((d) => (
              <li key={d.date} className="px-3.5 py-2.5 text-[13px]">
                <div className="flex items-center justify-between"><span>{formatDay(d.date, { weekday: "long", day: "numeric", month: "short" })}</span><span className={d.ok ? "text-forest-2" : "text-clay"}>{d.ok ? "On target" : "Needs attention"}</span></div>
                {!d.ok && <ul className="mt-1 space-y-0.5 text-[12px] text-muted">{[...d.messages, ...d.suggestions].map((m, i) => <li key={i}>{m}</li>)}</ul>}
              </li>
            ))}
          </ul>
          {result.notes.map((n, i) => <Notice key={i} tone="info">{n}</Notice>)}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between"><span className="label">Daily targets</span><button type="button" className="text-[12px] text-forest underline underline-offset-4" onClick={() => setShowTargets((v) => !v)}>{showTargets ? "Hide" : "Adjust for this plan"}</button></div>
              <p className="tnum text-[13px] text-ink-2">P {t.protein.value} g · C {t.carbs.value} g · F {t.fat.value} g · {t.kcal.value} kcal</p>
              {showTargets && <div className="mt-3"><TargetEditor value={t} onChange={setT} /></div>}
            </div>
            <div>
              <span className="label">Meals per day</span>
              <div className="flex gap-1.5">{[2, 3, 4, 5, 6].map((n) => <button type="button" key={n} className={cn("chip h-8 w-9 justify-center text-[13px]", o.mealsPerDay === n && "chip-on")} onClick={() => up({ mealsPerDay: n })}>{n}</button>)}</div>
              <p className="mt-1.5 text-[11.5px] text-muted">{slots.map((s) => SLOT_LABEL[s]).join(" · ")}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="label">Weekly budget ({currency})</span><input type="number" min={0} className="field tnum" value={o.weeklyBudget ?? ""} onChange={(e) => up({ weeklyBudget: e.target.value ? Number(e.target.value) : undefined })} placeholder="No limit" /></label>
              <label className="block"><span className="label">Max prep time</span><select className="field" value={o.maxPrepMin ?? ""} onChange={(e) => up({ maxPrepMin: e.target.value ? Number(e.target.value) : undefined })}><option value="">Any</option><option value="15">15 min</option><option value="20">20 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option></select></label>
              <label className="block"><span className="label">Cooking sessions</span><select className="field" value={o.cookingSessions} onChange={(e) => up({ cookingSessions: Number(e.target.value) })}>{[1, 2, 3, 4, 7].map((n) => <option key={n} value={n}>{n === 7 ? "Cook daily" : `${n} per week`}</option>)}</select></label>
            </div>
            <div className="space-y-2 text-[13px]">
              <label className="flex items-center gap-2"><input type="checkbox" checked={o.allowRepeats} onChange={(e) => up({ allowRepeats: e.target.checked })} /> Repeated meals are fine (batch cooking)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={o.supplements} onChange={(e) => up({ supplements: e.target.checked })} /> Protein supplements allowed</label>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <span className="label">Preferred cuisines</span>
              <div className="flex flex-wrap gap-1.5">{cuisines.map((c) => <button type="button" key={c} className={cn("chip", o.cuisines.includes(c) && "chip-on")} onClick={() => up({ cuisines: o.cuisines.includes(c) ? o.cuisines.filter((x) => x !== c) : [...o.cuisines, c] })}>{c}</button>)}</div>
            </div>
            <IngredientPicker label="Ingredients to use up" hint="Pre-filled from your inventory; recipes using these are preferred." value={o.available} onChange={(v) => up({ available: v })} catalog={catalog} />
            <IngredientPicker label="Ingredients to exclude" value={o.exclude} onChange={(v) => up({ exclude: v })} catalog={catalog} />
            <p className="text-[11.5px] leading-relaxed text-muted">Locked, eaten and prepared meals are kept. Every day is checked against your targets using the actual ingredient weights; if a combination can't meet them, you'll see exactly which targets conflict.</p>
          </div>
        </div>
      )}
    </Dialog>
  );
}
