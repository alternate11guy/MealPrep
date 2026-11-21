"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Copy, Wand2, RefreshCw, Plus, Scale, Save, CheckCircle2, LayoutTemplate, CopyPlus, ShoppingBasket } from "lucide-react";
import { MealCard, type RecipeSummary } from "@/components/meal-card";
import { MacroBar, Notice, Ring } from "@/components/ui";
import { Dialog, toast, useErrorToast } from "@/components/dialog";
import {
  addMealAction, confirmPlanAction, copyDayAction, deleteTemplateAction, duplicateWeekAction, moveMealAction, rebalanceDayAction,
  regenerateUnlockedAction, saveTemplateAction,
} from "@/app/actions/plan";
import { GenerateDialog, type GenerateDefaults } from "./generate-dialog";
import { fmt, targetBounds } from "@/lib/nutrition/targets";
import { cn, formatDay, money, SLOT_LABEL } from "@/lib/util";
import type { MealSlot, PlannedMeal, Targets } from "@/lib/types";

interface Day {
  date: string;
  meals: PlannedMeal[];
  totals: { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
  ok: boolean;
  violations: { label: string; by: number; key: string }[];
  conflicts: string[][];
}

export function PlanClient(props: {
  weekId: string; today: string; prevWeek: string; nextWeek: string; initialDay: string; openGenerate: boolean;
  hasPlan: boolean; status: string | null; demo: boolean; notes: string[]; proposer: string | null;
  days: Day[]; summaries: Record<string, RecipeSummary>; library: { id: string; title: string; slots: MealSlot[]; cuisine: string }[];
  targets: Targets; cost: { total: number; currency: string; coverage: number } | null; currency: string;
  defaults: GenerateDefaults; catalog: { id: string; name: string }[]; cuisines: string[]; templates: { id: string; name: string }[];
}) {
  const { weekId, days, summaries, targets } = props;
  const router = useRouter();
  const [selected, setSelected] = useState(props.initialDay);
  const [gen, setGen] = useState(props.openGenerate);
  const [copyOpen, setCopyOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const onError = useErrorToast();
  const run = (fn: () => Promise<unknown>, ok?: string) => start(async () => { try { await fn(); if (ok) toast(ok); } catch (e) { onError(e); } });

  useEffect(() => setSelected(props.initialDay), [props.initialDay, weekId]);
  const day = days.find((d) => d.date === selected) ?? days[0];
  const kcalB = targetBounds(targets.kcal);
  const weekLabel = `${formatDay(days[0].date, { day: "numeric", month: "short" })} – ${formatDay(days[6].date, { day: "numeric", month: "short", year: "numeric" })}`;

  const onDrop = (e: React.DragEvent, toDate: string) => {
    e.preventDefault();
    setDragOver(null);
    const raw = e.dataTransfer.getData("text/meal");
    if (!raw) return;
    const { mealId, date } = JSON.parse(raw) as { mealId: string; date: string };
    if (date === toDate) return;
    const copy = e.altKey || e.metaKey || e.ctrlKey;
    run(() => moveMealAction(weekId, date, mealId, toDate, copy), copy ? "Meal copied" : "Meal moved");
  };

  return (
    <div className="rise">
      <header className="border-b hairline px-4 pb-5 pt-7 sm:px-8 lg:pt-10">
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div>
            <p className="eyebrow">Weekly meal plan{props.status && <> · <span className={props.status === "confirmed" ? "text-forest" : "text-amber"}>{props.status === "confirmed" ? "Confirmed" : props.status === "proposed" ? "Proposed, awaiting confirmation" : "Draft"}</span></>}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <Link href={`/plan?week=${props.prevWeek}`} className="btn btn-ghost btn-sm px-1.5" aria-label="Previous week"><ChevronLeft size={18} /></Link>
              <h1 className="display text-[30px] leading-tight sm:whitespace-nowrap sm:text-[36px]">{weekLabel}</h1>
              <Link href={`/plan?week=${props.nextWeek}`} className="btn btn-ghost btn-sm px-1.5" aria-label="Next week"><ChevronRight size={18} /></Link>
              {!days.some((d) => d.date === props.today) && <Link href="/plan" className="btn btn-ghost btn-sm">This week</Link>}
            </div>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <button className="btn btn-primary btn-lg" onClick={() => setGen(true)}><Wand2 size={16} />Generate My Week</button>
            {props.hasPlan && <button className="btn btn-secondary" disabled={pending} onClick={() => run(() => regenerateUnlockedAction(weekId), "Unlocked meals regenerated")}><RefreshCw size={15} />Regenerate unlocked</button>}
            {props.hasPlan && props.status !== "confirmed" && <button className="btn btn-secondary" disabled={pending} onClick={() => run(() => confirmPlanAction(weekId), "Plan confirmed")}><CheckCircle2 size={15} />Confirm plan</button>}
            <button className="btn btn-secondary" onClick={() => setTplOpen(true)}><LayoutTemplate size={15} />Templates</button>
            {props.hasPlan && <button className="btn btn-secondary" disabled={pending} onClick={() => run(async () => { await duplicateWeekAction(weekId, props.nextWeek); router.push(`/plan?week=${props.nextWeek}`); }, "Copied to next week")}><CopyPlus size={15} />Duplicate to next week</button>}
          </div>
        </div>
        {props.hasPlan && props.cost && (
          <p className="mt-3 text-[12.5px] text-muted">
            {props.proposer === "claude" ? "Meals shortlisted by Claude, portions solved by the nutrition engine" : "Meals chosen and portions solved by the nutrition engine"}
            {props.cost.total > 0 && <> · estimated food cost {money(props.cost.total, props.currency)}{props.cost.coverage < 1 && ` (${Math.round(props.cost.coverage * 100)}% priced)`}</>}
            {" · "}<Link href={`/grocery?week=${weekId}`} className="text-forest underline underline-offset-4"><ShoppingBasket size={12} className="mr-1 inline" />Grocery list</Link>
          </p>
        )}
      </header>

      {/* Day picker */}
      <nav className="no-print sticky top-0 z-20 border-b hairline bg-ivory/95 px-4 py-3 backdrop-blur sm:px-8" aria-label="Days">
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((d) => {
            const on = d.date === selected;
            return (
              <button key={d.date} onClick={() => setSelected(d.date)} aria-pressed={on}
                onDragOver={(e) => { e.preventDefault(); setDragOver(d.date); }} onDragLeave={() => setDragOver(null)} onDrop={(e) => onDrop(e, d.date)}
                className={cn("relative rounded-[6px] border px-1 py-2 text-center transition-colors", on ? "border-forest bg-forest text-ivory" : "hairline bg-card hover:border-line-strong", dragOver === d.date && "ring-2 ring-forest-2")}>
                <span className={cn("block text-[10px] uppercase tracking-wider", on ? "text-ivory/75" : "text-muted")}>{formatDay(d.date, { weekday: "short" })}</span>
                <span className="tnum block text-[15px] font-medium">{formatDay(d.date, { day: "numeric" })}</span>
                {d.meals.length > 0 && <span className={cn("absolute right-1.5 top-1.5 size-1.5 rounded-full", d.ok ? (on ? "bg-ivory" : "bg-forest") : "bg-clay")} title={d.ok ? "On target" : "Off target"} />}
                {d.date === props.today && <span className={cn("absolute inset-x-0 -bottom-px mx-auto h-0.5 w-5 rounded-full", on ? "bg-ivory" : "bg-forest")} />}
              </button>
            );
          })}
        </div>
      </nav>

      {props.demo && <div className="px-4 pt-5 sm:px-8"><Notice tone="demo" title="Demonstration week">Generated by the engine from house recipes. Past days show simulated eating history.</Notice></div>}

      {!props.hasPlan ? (
        <div className="px-4 py-16 text-center sm:px-8">
          <p className="display text-3xl">No plan for this week yet</p>
          <p className="mx-auto mt-2 max-w-md text-[13.5px] text-muted">Generate a week from your targets, duplicate a previous week, or start from a template.</p>
          <div className="mt-6 flex justify-center gap-2">
            <button className="btn btn-primary btn-lg" onClick={() => setGen(true)}><Wand2 size={16} />Generate My Week</button>
            <button className="btn btn-secondary btn-lg" onClick={() => run(() => duplicateWeekAction(props.prevWeek, weekId), "Copied last week")}><Copy size={15} />Copy last week</button>
          </div>
        </div>
      ) : (
        <>
          {/* Selected day summary */}
          <section className="grid gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[auto_1fr_auto] lg:items-center">
            <div className="flex items-center gap-5">
              <Ring value={day.totals.kcal} max={kcalB.hi === Infinity ? targets.kcal.value : kcalB.hi} size={132} stroke={9} color={day.totals.kcal > kcalB.hi ? "var(--color-clay)" : "var(--color-forest)"}>
                <div><p className="tnum text-[28px] font-medium leading-none">{fmt(day.totals.kcal)}</p><p className="mt-1 text-[11px] text-muted">kcal planned</p></div>
              </Ring>
              <div className="lg:hidden">
                <p className="display text-2xl">{formatDay(day.date, { weekday: "long" })}</p>
                <p className="text-[12.5px] text-muted">{day.meals.length} meals</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <MacroBar label="Protein" unit="g" keyName="protein" planned={day.totals.protein} target={targets.protein} />
              <MacroBar label="Carbohydrate" unit="g" keyName="carbs" planned={day.totals.carbs} target={targets.carbs} />
              <MacroBar label="Fat" unit="g" keyName="fat" planned={day.totals.fat} target={targets.fat} />
            </div>
            <div className="no-print flex flex-wrap gap-2 lg:flex-col">
              <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(async () => { const r = await rebalanceDayAction(weekId, day.date); toast(r.satisfied ? "Portions rebalanced; day is on target" : `Rebalanced as close as possible: ${r.violations.join(", ")}`, r.satisfied ? "ok" : "error"); })}><Scale size={14} />Rebalance portions</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setCopyOpen(true)}><Copy size={14} />Copy day to…</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setAddOpen(true)}><Plus size={14} />Add meal</button>
            </div>
          </section>
          {!day.ok && day.meals.length > 0 && (
            <div className="px-4 sm:px-8">
              <Notice tone="caution" title={`${formatDay(day.date, { weekday: "long" })} is off target`}>
                {day.violations.map((v) => `${v.label} ${v.by > 0 ? "over" : "under"} by ${fmt(Math.abs(v.by))}${v.key === "kcal" ? " kcal" : " g"}`).join("; ")}.
                {day.conflicts.length > 0 ? ` No portion sizes can meet every target with these meals; relaxing ${day.conflicts.map((c) => c.map((k) => ({ kcal: "energy", protein: "protein", carbs: "carbohydrate", fat: "fat" } as Record<string, string>)[k]).join(" + ")).join(" or ")} would. Try replacing a meal with a leaner option or adjusting targets.` : " Try “Rebalance portions”, or replace a meal."}
              </Notice>
            </div>
          )}

          {/* Mobile and tablet: selected day only */}
          <section className="grid grid-cols-2 gap-3 px-4 py-5 sm:grid-cols-3 sm:px-8 xl:hidden">
            {day.meals.map((m) => <MealCard key={m.id} meal={m} recipe={summaries[m.recipeId]} weekId={weekId} date={day.date} variant="compact" />)}
            <button onClick={() => setAddOpen(true)} className="grid min-h-40 place-items-center rounded-[6px] border border-dashed border-line-strong text-[12.5px] text-muted hover:border-forest hover:text-forest"><span className="flex items-center gap-1.5"><Plus size={14} />Add meal</span></button>
          </section>

          {/* Desktop: full week board with drag and drop */}
          <section className="hidden px-8 pb-10 pt-2 xl:block">
            <p className="mb-3 text-[12px] text-muted">Drag a meal to another day to move it; hold Alt (⌥) while dropping to copy.</p>
            <div className="grid grid-cols-7 gap-3">
              {days.map((d) => (
                <div key={d.date} data-day={d.date}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(d.date); }} onDragLeave={() => setDragOver(null)} onDrop={(e) => onDrop(e, d.date)}
                  className={cn("min-w-0 rounded-[8px] p-1.5 transition-colors", d.date === selected ? "bg-forest-soft/70" : "", dragOver === d.date && "bg-forest-soft ring-2 ring-forest-2/50")}>
                  <button onClick={() => setSelected(d.date)} className="mb-2 w-full px-1 text-left">
                    <span className="flex items-baseline justify-between"><span className="display text-[17px]">{formatDay(d.date, { weekday: "long" })}</span><span className={cn("size-1.5 rounded-full", d.meals.length ? (d.ok ? "bg-forest" : "bg-clay") : "bg-transparent")} /></span>
                    <span className="tnum block text-[11px] text-muted">{fmt(d.totals.kcal)} kcal · P{fmt(d.totals.protein)} C{fmt(d.totals.carbs)} F{fmt(d.totals.fat)}</span>
                  </button>
                  <div className="space-y-2">
                    {d.meals.map((m) => <MealCard key={m.id} meal={m} recipe={summaries[m.recipeId]} weekId={weekId} date={d.date} variant="compact" draggable />)}
                    <button onClick={() => { setSelected(d.date); setAddOpen(true); }} className="flex w-full items-center justify-center gap-1 rounded-[6px] border border-dashed border-line-strong py-2 text-[11.5px] text-muted hover:border-forest hover:text-forest"><Plus size={12} />Add</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {props.notes.length > 0 && (
            <section className="px-4 pb-8 sm:px-8">
              <details className="rounded-[6px] border hairline bg-card px-4 py-3 text-[12.5px]">
                <summary className="cursor-pointer font-medium">Planner notes ({props.notes.length})</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">{props.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
              </details>
            </section>
          )}
        </>
      )}

      <GenerateDialog open={gen} onClose={() => setGen(false)} weekId={weekId} targets={targets} defaults={props.defaults} catalog={props.catalog} cuisines={props.cuisines} currency={props.currency} />

      <Dialog open={copyOpen} onClose={() => setCopyOpen(false)} title={`Copy ${formatDay(day.date, { weekday: "long" })} to…`}>
        <p className="mb-3 text-[13px] text-muted">Replaces the target day's planned (unlocked, not eaten) meals with a copy of this day.</p>
        <div className="grid grid-cols-2 gap-2">
          {days.filter((d) => d.date !== day.date).map((d) => (
            <button key={d.date} className="btn btn-secondary justify-start" disabled={pending} onClick={() => run(async () => { await copyDayAction(weekId, day.date, d.date); setCopyOpen(false); }, `Copied to ${formatDay(d.date, { weekday: "long" })}`)}>{formatDay(d.date)}</button>
          ))}
        </div>
      </Dialog>

      <AddMealDialog open={addOpen} onClose={() => setAddOpen(false)} weekId={weekId} date={day.date} library={props.library} />

      <Dialog open={tplOpen} onClose={() => setTplOpen(false)} title="Week templates">
        {props.hasPlan && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const name = new FormData(e.currentTarget).get("name") as string; run(() => saveTemplateAction(weekId, name), "Saved as template"); e.currentTarget.reset(); }}>
            <input name="name" required maxLength={80} className="field" placeholder="Name this week, e.g. Mediterranean cut" />
            <button className="btn btn-primary"><Save size={14} />Save</button>
          </form>
        )}
        <div className="mt-4 divide-y divide-line">
          {props.templates.length === 0 && <p className="py-6 text-center text-[13px] text-muted">No templates yet. Save a week that worked well to reuse it.</p>}
          {props.templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 py-2.5">
              <span className="text-[13.5px]">{t.name}</span>
              <div className="flex gap-1.5">
                <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(async () => { await duplicateWeekAction(t.id, weekId); setTplOpen(false); }, "Template applied to this week")}>Use for this week</button>
                <button className="btn btn-ghost btn-sm text-clay" disabled={pending} onClick={() => run(() => deleteTemplateAction(t.id))}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </Dialog>
    </div>
  );
}

function AddMealDialog({ open, onClose, weekId, date, library }: { open: boolean; onClose: () => void; weekId: string; date: string; library: { id: string; title: string; slots: MealSlot[]; cuisine: string }[] }) {
  const [slot, setSlot] = useState<MealSlot>("lunch");
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const onError = useErrorToast();
  const list = library.filter((r) => r.slots.includes(slot) && r.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog open={open} onClose={onClose} title={`Add a meal · ${formatDay(date, { weekday: "long" })}`}>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(SLOT_LABEL) as MealSlot[]).map((s) => <button key={s} className={cn("chip", slot === s && "chip-on")} onClick={() => setSlot(s)}>{SLOT_LABEL[s]}</button>)}
      </div>
      <input className="field mt-3" placeholder="Search recipes" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-3 max-h-[50vh] divide-y divide-line overflow-y-auto">
        {list.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 py-2">
            <span className="min-w-0"><span className="block truncate text-[13.5px]">{r.title}</span><span className="text-[11.5px] text-muted">{r.cuisine}</span></span>
            <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => { try { await addMealAction(weekId, date, slot, r.id, 1); toast("Meal added. Use Rebalance portions to fit your targets."); onClose(); } catch (e) { onError(e); } })}>Add</button>
          </li>
        ))}
        {list.length === 0 && <li className="py-6 text-center text-[13px] text-muted">No recipes for this slot match.</li>}
      </ul>
    </Dialog>
  );
}
