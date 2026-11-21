"use client";

import { useState, useTransition } from "react";
import { saveOnboardingAction } from "@/app/actions/data";
import { TargetEditor } from "@/components/target-editor";
import { EnergySummary, TargetFlags } from "@/components/target-flags";
import { ACTIVITY } from "@/lib/nutrition/energy";
import type { Profile, Targets } from "@/lib/types";
import { cn } from "@/lib/util";

const STEPS = ["About you", "Activity", "Food", "Targets", "Start"];
const DIETS = ["Halal", "Pescatarian", "Vegetarian", "Gluten-free", "Dairy-free", "Low FODMAP"];
const CURRENCIES = ["EGP", "QAR", "USD", "EUR", "GBP", "AED", "SAR"];

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...value, ...parts])]);
    setDraft("");
  };
  return (
    <div>
      <div className="flex gap-2">
        <input className="field" value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" className="btn btn-secondary" onClick={add}>Add</button>
      </div>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((v) => (
            <button type="button" key={v} className="chip" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${v}`}>{v} <span aria-hidden>×</span></button>
          ))}
        </div>
      )}
    </div>
  );
}

function NumberField({ label, value, onChange, unit, min, max }: { label: string; value?: number; onChange: (v?: number) => void; unit?: string; min?: number; max?: number }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="relative">
        <input type="number" inputMode="decimal" min={min} max={max} className="field tnum pr-12" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />
        {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted">{unit}</span>}
      </div>
    </label>
  );
}

export function Onboarding({ initialProfile, initialTargets }: { initialProfile: Profile; initialTargets: Targets }) {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Profile>(initialProfile);
  const [t, setT] = useState<Targets>(initialTargets);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const up = (patch: Partial<Profile>) => setP((x) => ({ ...x, ...patch }));

  const finish = (demo: boolean) => start(async () => {
    setError(null);
    try {
      const { onboarded: _o, demo: _d, ...rest } = p;
      void _o; void _d;
      await saveOnboardingAction(rest, t, demo);
    } catch (e) {
      if (e && typeof e === "object" && "digest" in e && String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
      setError(e instanceof Error ? e.message : "Couldn't save. Check the values and try again.");
    }
  });

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-10 sm:px-6">
      <p className="eyebrow">Setting up Mise</p>
      <h1 className="display mt-2 text-[40px] leading-tight">{STEPS[step]}</h1>
      <ol className="mt-5 flex gap-1.5" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-forest" : "bg-line")} aria-current={i === step ? "step" : undefined}><span className="sr-only">{s}</span></li>
        ))}
      </ol>

      <div className="mt-8 space-y-5 rise" key={step}>
        {step === 0 && (
          <>
            <p className="text-[13.5px] leading-relaxed text-muted">Used to estimate your energy needs and spot targets that may be too low. Everything stays in your private database.</p>
            <div className="grid grid-cols-2 gap-4">
              <NumberField label="Age" value={p.age} onChange={(v) => up({ age: v })} unit="years" min={14} max={110} />
              <label className="block">
                <span className="label">Sex for energy equations <span className="font-normal text-muted">(optional)</span></span>
                <select className="field" value={p.sex ?? ""} onChange={(e) => up({ sex: (e.target.value || undefined) as Profile["sex"] })}>
                  <option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option>
                </select>
              </label>
              <NumberField label="Height" value={p.heightCm} onChange={(v) => up({ heightCm: v })} unit="cm" />
              <NumberField label="Current weight" value={p.weightKg} onChange={(v) => up({ weightKg: v })} unit="kg" />
              <NumberField label="Target weight" value={p.targetWeightKg} onChange={(v) => up({ targetWeightKg: v })} unit="kg" />
              <label className="block">
                <span className="label">Currency</span>
                <select className="field" value={p.currency} onChange={(e) => up({ currency: e.target.value })}>
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="space-y-2">
              <span className="label">Activity level</span>
              {Object.entries(ACTIVITY).map(([id, a]) => (
                <button type="button" key={id} onClick={() => up({ activity: id as Profile["activity"] })}
                  className={cn("flex w-full items-center justify-between rounded-[6px] border px-3.5 py-3 text-left transition-colors", p.activity === id ? "border-forest bg-forest-soft" : "hairline bg-card hover:border-line-strong")}>
                  <span className="text-[13.5px] font-medium">{a.label}</span><span className="text-[12px] text-muted">{a.hint}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <NumberField label="Training sessions per week" value={p.trainingPerWeek} onChange={(v) => up({ trainingPerWeek: v ?? 0 })} min={0} max={14} />
              <NumberField label="Meals per day" value={p.mealsPerDay} onChange={(v) => up({ mealsPerDay: Math.min(6, Math.max(2, v ?? 4)) })} min={2} max={6} />
            </div>
            <div>
              <span className="label">Objective</span>
              <div className="flex flex-wrap gap-2">
                {([["lose", "Weight loss"], ["maintain", "Maintenance"], ["gain", "Muscle building"]] as const).map(([id, l]) => (
                  <button type="button" key={id} className={cn("chip h-8 px-3 text-[12.5px]", p.goal === id && "chip-on")} onClick={() => up({ goal: id })}>{l}</button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <span className="label">Dietary requirements</span>
              <div className="flex flex-wrap gap-2">
                {DIETS.map((d) => (
                  <button type="button" key={d} className={cn("chip h-8 px-3 text-[12.5px]", p.diet.includes(d) && "chip-on")} onClick={() => up({ diet: p.diet.includes(d) ? p.diet.filter((x) => x !== d) : [...p.diet, d] })}>{d}</button>
                ))}
              </div>
            </div>
            <div><span className="label">Allergies</span><TagInput value={p.allergies} onChange={(v) => up({ allergies: v })} placeholder="e.g. shellfish, sesame" /></div>
            <div><span className="label">Ingredients you dislike</span><TagInput value={p.dislikes} onChange={(v) => up({ dislikes: v })} placeholder="e.g. mushrooms, cottage cheese" /></div>
            <p className="text-[12px] text-muted">Recipes containing allergies or disliked ingredients are never suggested. Always check labels yourself for allergens.</p>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={p.supplements} onChange={(e) => up({ supplements: e.target.checked })} /> Protein supplements (whey) are fine in my plans</label>
          </>
        )}

        {step === 3 && (
          <>
            <EnergySummary profile={p} />
            <NumberField label="Calorie intake recommended by a healthcare professional (optional)" value={p.clinicianKcal} onChange={(v) => up({ clinicianKcal: v })} unit="kcal" />
            <div>
              <p className="label">Daily targets</p>
              <p className="mb-3 text-[12.5px] text-muted">Set each target as exact, a minimum, a maximum or a range. They apply to every day and can be changed any time.</p>
              <TargetEditor value={t} onChange={setT} />
            </div>
            <TargetFlags targets={t} profile={p} />
          </>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <button type="button" disabled={pending} onClick={() => finish(true)} className="w-full rounded-[8px] border hairline bg-card p-5 text-left transition-colors hover:border-forest">
              <p className="display text-xl">Start with a demonstration week</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">A validated seven-day plan from the house recipes, a few pantry items, and a simulated week of history so you can explore analytics. Everything is labelled as demo data and can be cleared in one click.</p>
            </button>
            <button type="button" disabled={pending} onClick={() => finish(false)} className="w-full rounded-[8px] border hairline bg-card p-5 text-left transition-colors hover:border-forest">
              <p className="display text-xl">Start empty and generate my first week</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">Go straight to the planner with your targets.</p>
            </button>
            {pending && <p className="text-[13px] text-muted">Building your plan…</p>}
          </div>
        )}
        {error && <p role="alert" className="text-[13px] text-clay">{error}</p>}
      </div>

      <div className="mt-10 flex justify-between">
        <button type="button" className="btn btn-ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</button>
        {step < STEPS.length - 1 && <button type="button" className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>Continue</button>}
      </div>
    </main>
  );
}
