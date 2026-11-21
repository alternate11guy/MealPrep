"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, ChefHat, ChevronLeft, ChevronRight, Printer, Snowflake, Thermometer, X } from "lucide-react";
import { Empty, Notice, PageHeader } from "@/components/ui";
import { StepTimer } from "@/components/step-timer";
import { toast, useErrorToast } from "@/components/dialog";
import { confirmPrepAction, updatePrepAction } from "@/app/actions/data";
import { fmt } from "@/lib/nutrition/targets";
import { addDays, cn, formatDay, grams, SLOT_LABEL } from "@/lib/util";
import type { MealSlot, PlannedMeal, PrepStage } from "@/lib/types";

export interface LabelData {
  id: string; title: string; recipeId: string; date: string; slot: MealSlot; cooked: string | null; useBy: string | null;
  storage: "fridge" | "freezer" | "fresh"; warning?: string; weight: number; servings: number;
  kcal: number; protein: number; carbs: number; fat: number; reheat: string; status: PlannedMeal["status"];
}
export interface SessionView {
  key: string; date: string; prepMin: number; cookMin: number; containers: number; equipment: string[]; confirmed: string | null;
  batches: { recipeId: string; title: string; servings: number; fridgeDays: number; freezerMonths: number | null; ingredients: { name: string; grams: number; note?: string; group?: string }[] }[];
  proteins: { name: string; total: number; parts: { recipe: string; grams: number; group?: string }[] }[];
  chopping: { name: string; grams: number; notes: string[] }[];
  steps: { id: string; stage: PrepStage; stageLabel: string; text: string; recipe: string; timerMin?: number }[];
  labels: LabelData[];
}

const DAY_CHOICES = [-1, 0, 1, 2, 3, 4, 5];

function Label({ l }: { l: LabelData }) {
  return (
    <div className="label-card rounded-[6px] border border-ink/25 bg-white p-3 text-[11px] leading-snug text-ink">
      <div className="flex items-start justify-between gap-2">
        <p className="display text-[14px] leading-tight">{l.title}</p>
        {l.storage === "freezer" && <span className="shrink-0 rounded-[3px] border border-ink/40 px-1 text-[9px] font-medium uppercase tracking-wide">Freeze</span>}
      </div>
      <p className="mt-1 font-medium">{SLOT_LABEL[l.slot]} · {formatDay(l.date, { weekday: "short", day: "numeric", month: "short" })}</p>
      <p className="tnum mt-1">{grams(l.weight)} · {fmt(l.kcal)} kcal · P {fmt(l.protein)} · C {fmt(l.carbs)} · F {fmt(l.fat)}</p>
      {l.cooked && <p className="mt-1">Cooked {formatDay(l.cooked, { day: "numeric", month: "short" })} · {l.storage === "freezer" ? "frozen; thaw in fridge the night before" : `use by ${formatDay(l.useBy!, { day: "numeric", month: "short" })}`}</p>}
      <p className="mt-1 text-ink/70">Reheat to 74 °C / 165 °F, steaming throughout.</p>
    </div>
  );
}

function CookingMode({ s, done, onToggle, onClose }: { s: SessionView; done: Record<string, boolean>; onToggle: (id: string) => void; onClose: () => void }) {
  const first = s.steps.findIndex((x) => !done[x.id]);
  const [i, setI] = useState(first === -1 ? 0 : first);
  const step = s.steps[i];
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {});
    const key = (e: KeyboardEvent) => { if (e.key === "ArrowRight") setI((v) => Math.min(s.steps.length - 1, v + 1)); if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1)); if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); lock?.release().catch(() => {}); };
  }, [s.steps.length, onClose]);
  if (!step) return null;
  const doneCount = s.steps.filter((x) => done[x.id]).length;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-ivory" role="dialog" aria-modal="true" aria-label="Cooking mode">
      <div className="flex items-center justify-between border-b hairline px-4 py-3 sm:px-8">
        <div><p className="eyebrow">Cooking mode · {formatDay(s.date, { weekday: "long" })}</p><p className="tnum text-[12px] text-muted">Step {i + 1} of {s.steps.length} · {doneCount} done</p></div>
        <button className="btn btn-ghost" onClick={onClose} aria-label="Exit cooking mode"><X size={18} />Exit</button>
      </div>
      <div className="h-1 bg-line"><div className="h-full bg-forest transition-[width] duration-500" style={{ width: `${(doneCount / s.steps.length) * 100}%` }} /></div>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center overflow-y-auto px-5 py-8 sm:px-8">
        <p className="eyebrow text-forest-2">{step.stageLabel} · {step.recipe}</p>
        <p className="display mt-4 text-[26px] leading-snug sm:text-[34px]">{step.text}</p>
        {step.timerMin ? <div className="mt-6"><StepTimer key={step.id} minutes={step.timerMin} large /></div> : null}
        {(step.stage === "cook") && <p className="mt-6 flex items-center gap-2 text-[13px] text-muted"><Thermometer size={15} />Poultry and minced meat 74 °C (165 °F); fish 63 °C (145 °F); check the thickest part.</p>}
      </div>
      <div className="grid grid-cols-3 gap-2 border-t hairline px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:px-8">
        <button className="btn btn-secondary btn-lg" disabled={i === 0} onClick={() => setI(i - 1)}><ChevronLeft size={18} />Back</button>
        <button className={cn("btn btn-lg", done[step.id] ? "btn-secondary" : "btn-primary")} onClick={() => { onToggle(step.id); if (!done[step.id] && i < s.steps.length - 1) setI(i + 1); }}>
          <CheckCircle2 size={18} />{done[step.id] ? "Undo" : "Done"}
        </button>
        <button className="btn btn-secondary btn-lg" disabled={i === s.steps.length - 1} onClick={() => setI(i + 1)}>Next<ChevronRight size={18} /></button>
      </div>
    </div>
  );
}

export function PrepClient(props: {
  weekId: string; prevWeek: string; nextWeek: string; today: string; hasPlan: boolean; sessionsSetting: number | "custom"; customDays: number[];
  done: Record<string, boolean>; sessions: SessionView[]; fresh: LabelData[]; safety: { label: string; url: string }; name?: string;
}) {
  const { weekId } = props;
  const onError = useErrorToast();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(props.done);
  const [active, setActive] = useState(() => {
    const upcoming = props.sessions.findIndex((x) => !x.confirmed && x.date >= props.today);
    if (upcoming >= 0) return upcoming;
    const open = props.sessions.findIndex((x) => !x.confirmed);
    return open >= 0 ? open : 0;
  });
  const [cooking, setCooking] = useState(false);
  const [custom, setCustom] = useState(props.customDays);
  const s = props.sessions[Math.min(active, props.sessions.length - 1)];

  const run = (fn: () => Promise<unknown>, ok?: string) => start(async () => { try { await fn(); if (ok) toast(ok); } catch (e) { onError(e); } });
  const toggle = (id: string) => { const v = !done[id]; setDone((d) => ({ ...d, [id]: v })); run(() => updatePrepAction(weekId, { done: { [id]: v } })); };
  const setSessions = (n: number | "custom", days?: number[]) => { setActive(0); run(() => updatePrepAction(weekId, { sessions: n, ...(days ? { customDays: days } : {}) })); };
  const printLabels = () => {
    document.documentElement.dataset.print = "labels";
    const clear = () => { delete document.documentElement.dataset.print; window.removeEventListener("afterprint", clear); };
    window.addEventListener("afterprint", clear);
    window.print();
  };
  const confirm = () => {
    if (!s) return;
    run(async () => {
      const r = await confirmPrepAction(weekId, s.key);
      toast(`${r.meals} meals marked prepared${r.deductions.length ? `; ${r.deductions.length} inventory item(s) reduced` : ""}`);
    });
  };

  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekId, i));
  const stageGroups = s ? s.steps.reduce<{ label: string; steps: SessionView["steps"] }[]>((acc, x) => {
    const g = acc[acc.length - 1];
    if (g && g.label === x.stageLabel) g.steps.push(x); else acc.push({ label: x.stageLabel, steps: [x] });
    return acc;
  }, []) : [];
  const doneCount = s ? s.steps.filter((x) => done[x.id]).length : 0;

  return (
    <div className="rise pb-16">
      <PageHeader eyebrow="Meal prep" title={<span className="flex items-center gap-1"><Link href={`/prep?week=${props.prevWeek}`} className="btn btn-ghost btn-sm px-1" aria-label="Previous week"><ChevronLeft size={18} /></Link>{formatDay(dates[0], { day: "numeric", month: "short" })} – {formatDay(dates[6], { day: "numeric", month: "short" })}<Link href={`/prep?week=${props.nextWeek}`} className="btn btn-ghost btn-sm px-1" aria-label="Next week"><ChevronRight size={18} /></Link></span>}
        sub="Batch-cook the week's meals in a few sessions. Meals that would sit in the fridge past their safe window are frozen or made fresh.">
        {s && <button className="btn btn-primary btn-lg" onClick={() => setCooking(true)}><ChefHat size={16} />Start cooking mode</button>}
        {s && <button className="btn btn-secondary" onClick={printLabels}><Printer size={15} />Print labels</button>}
      </PageHeader>

      <div className="no-print border-b hairline px-4 py-4 sm:px-8">
        <span className="label">Cooking sessions this week</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {[1, 2, 3].map((n) => <button key={n} className={cn("chip", props.sessionsSetting === n && "chip-on")} disabled={pending} onClick={() => setSessions(n)}>{n} {n === 1 ? "session" : "sessions"}</button>)}
          <button className={cn("chip", props.sessionsSetting === "custom" && "chip-on")} disabled={pending} onClick={() => setSessions("custom", custom)}>Custom days</button>
        </div>
        {props.sessionsSetting === "custom" && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {DAY_CHOICES.map((o) => {
              const on = custom.includes(o);
              return <button key={o} className={cn("chip", on && "chip-on")} onClick={() => { const next = on ? custom.filter((x) => x !== o) : [...custom, o].sort((a, b) => a - b); if (!next.length) return; setCustom(next); setSessions("custom", next); }}>{formatDay(addDays(weekId, o), { weekday: "short", day: "numeric" })}</button>;
            })}
          </div>
        )}
      </div>

      {!props.hasPlan ? (
        <div className="px-4 py-8 sm:px-8"><Empty title="No plan for this week" action={<Link href={`/plan?week=${weekId}&generate=1`} className="btn btn-primary">Generate this week</Link>}>Prep sessions are built from your meal plan.</Empty></div>
      ) : !s ? (
        <div className="px-4 py-8 sm:px-8"><Empty title="Nothing to batch-cook">Every meal this week is either skipped or best made fresh.</Empty></div>
      ) : (
        <>
          {props.sessions.length > 1 && (
            <div className="no-print flex gap-2 overflow-x-auto px-4 pt-5 sm:px-8">
              {props.sessions.map((x, i) => (
                <button key={x.key} onClick={() => setActive(i)} className={cn("shrink-0 rounded-[8px] border px-4 py-2.5 text-left transition-colors", i === active ? "border-forest bg-forest text-ivory" : "hairline bg-card hover:bg-paper")}>
                  <span className="block text-[11px] uppercase tracking-[0.08em] opacity-75">Session {i + 1}{x.confirmed && " · done"}</span>
                  <span className="display block text-[18px]">{formatDay(x.date, { weekday: "long", day: "numeric", month: "short" })}</span>
                  <span className="tnum block text-[11.5px] opacity-75">{x.containers} containers · ~{x.prepMin + x.cookMin} min</span>
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-8 px-4 py-6 sm:px-8 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-8">
              <section>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="display text-[24px]">{formatDay(s.date, { weekday: "long", day: "numeric", month: "long" })}</h2>
                  <p className="tnum text-[12.5px] text-muted">{s.containers} containers · prep ~{s.prepMin} min · cook ~{s.cookMin} min (overlapping)</p>
                </div>
                {s.date < props.today && !s.confirmed && <Notice tone="caution" className="mt-3">This session&apos;s day has passed. If you cooked, confirm it below so meals are marked prepared and inventory is updated.</Notice>}
                {s.confirmed && <Notice tone="ok" className="mt-3">Confirmed {formatDay(s.confirmed.slice(0, 10), { weekday: "long", day: "numeric", month: "short" })}. Meals are marked prepared and inventory was reduced.</Notice>}
              </section>

              <section>
                <h3 className="display text-[19px]">What you&apos;re cooking</h3>
                <ul className="mt-3 grid gap-3 md:grid-cols-2">
                  {s.batches.map((b) => (
                    <li key={b.recipeId} className="panel px-4 py-3.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <Link href={`/recipes/${b.recipeId}`} className="display text-[17px] leading-snug hover:text-forest">{b.title}</Link>
                        <span className="tnum shrink-0 text-[12px] text-muted">× {fmt(b.servings, 2)} servings</span>
                      </div>
                      <details className="mt-2 text-[12.5px]">
                        <summary className="cursor-pointer text-muted">Scaled ingredients</summary>
                        <ul className="mt-1.5 space-y-0.5">{b.ingredients.map((x, i) => <li key={i} className="flex justify-between gap-3"><span>{x.name}{x.note && <span className="text-muted">, {x.note}</span>}</span><span className="tnum shrink-0">{grams(x.grams)}</span></li>)}</ul>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>

              {s.proteins.length > 0 && (
                <section>
                  <h3 className="display text-[19px]">Proteins, bought and weighed once</h3>
                  <ul className="mt-3 divide-y divide-line border-y hairline text-[13px]">
                    {s.proteins.map((p) => (
                      <li key={p.name} className="py-2.5">
                        <div className="flex justify-between"><span className="font-medium">{p.name}</span><span className="tnum font-medium">{grams(p.total)} raw</span></div>
                        {p.parts.length > 1 && <p className="mt-0.5 text-[12px] text-muted">{p.parts.map((x) => `${grams(x.grams)} ${x.recipe}${x.group ? ` (${x.group.toLowerCase()})` : ""}`).join(" · ")}</p>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <div className="flex items-baseline justify-between">
                  <h3 className="display text-[19px]">Sequence</h3>
                  <span className="tnum text-[12px] text-muted">{doneCount} of {s.steps.length} done</span>
                </div>
                <div className="mt-3 space-y-5">
                  {stageGroups.map((g, gi) => (
                    <div key={gi}>
                      <p className="eyebrow mb-1.5">{g.label}</p>
                      <ul className="space-y-1.5">
                        {g.steps.map((x) => (
                          <li key={x.id} className={cn("flex gap-3 rounded-[6px] px-2 py-1.5 hover:bg-ink/[0.03]", done[x.id] && "opacity-50")}>
                            <input type="checkbox" className="mt-1 size-[17px] shrink-0 accent-[var(--color-forest)]" checked={Boolean(done[x.id])} onChange={() => toggle(x.id)} aria-label="Step done" />
                            <div className="min-w-0 text-[13.5px] leading-relaxed">
                              <span className={cn(done[x.id] && "line-through")}>{x.text}</span>
                              <span className="block text-[11.5px] text-muted">{x.recipe}</span>
                              {x.timerMin ? <div className="mt-1"><StepTimer minutes={x.timerMin} /></div> : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>

              {!s.confirmed && (
                <section className="no-print panel flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                  <div className="max-w-xl text-[13px]">
                    <p className="font-medium">Finished cooking?</p>
                    <p className="text-muted">Confirming marks these {s.containers} meals as prepared and subtracts the ingredients from your inventory, using the soonest-expiring stock first. Nothing changes until you confirm.</p>
                  </div>
                  <button className="btn btn-primary" disabled={pending} onClick={confirm}><CheckCircle2 size={15} />Confirm prep</button>
                </section>
              )}
            </div>

            <aside className="space-y-6">
              {s.chopping.length > 0 && (
                <section className="panel px-4 py-4">
                  <h3 className="eyebrow">Chopping list</h3>
                  <ul className="mt-2 space-y-1 text-[13px]">{s.chopping.map((c) => <li key={c.name} className="flex justify-between gap-3"><span>{c.name}{c.notes.length > 0 && <span className="text-muted">, {c.notes.join(", ")}</span>}</span><span className="tnum shrink-0">{grams(c.grams)}</span></li>)}</ul>
                </section>
              )}
              {s.equipment.length > 0 && (
                <section className="panel px-4 py-4">
                  <h3 className="eyebrow">Equipment</h3>
                  <ul className="mt-2 flex flex-wrap gap-1.5">{s.equipment.map((e) => <li key={e} className="chip">{e}</li>)}</ul>
                </section>
              )}
              <section className="panel px-4 py-4">
                <h3 className="eyebrow">Containers</h3>
                <ul className="mt-2 divide-y divide-line text-[12.5px]">
                  {s.labels.map((l) => (
                    <li key={l.id} className="py-2">
                      <div className="flex justify-between gap-2"><span className="min-w-0 truncate">{l.title}</span><span className="tnum shrink-0 font-medium">{grams(l.weight)}</span></div>
                      <p className="flex items-center gap-1 text-[11.5px] text-muted">{l.storage === "freezer" && <Snowflake size={11} className="text-forest-2" />}{SLOT_LABEL[l.slot]} {formatDay(l.date, { weekday: "short" })} · {l.storage === "freezer" ? "freeze" : `fridge, day ${Math.max(0, (new Date(l.date).getTime() - new Date(s.date).getTime()) / 864e5)}`}{l.status !== "planned" && ` · ${l.status}`}</p>
                      {l.warning && <p className="mt-0.5 text-[11.5px] text-amber">{l.warning}</p>}
                    </li>
                  ))}
                </ul>
              </section>
              <section className="panel px-4 py-4 text-[12.5px] leading-relaxed">
                <h3 className="eyebrow">Food safety</h3>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-2">
                  <li>Cool cooked food and refrigerate within 2 hours (1 hour above 32 °C). Shallow containers cool faster.</li>
                  <li>Keep the fridge at 4 °C (40 °F) or below; eat refrigerated meals within 3–4 days. This plan uses each recipe&apos;s own limit, 3 days for fish and eggs.</li>
                  <li>Thaw frozen meals in the fridge, never on the counter.</li>
                  <li>Reheat to 74 °C (165 °F) until steaming throughout.</li>
                </ul>
                <a href={props.safety.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-forest underline underline-offset-4">{props.safety.label}</a>
              </section>
            </aside>
          </div>

          <div className="label-sheet hidden grid-cols-3 gap-2 p-2">
            {s.labels.map((l) => <Label key={l.id} l={l} />)}
          </div>
          <section className="no-print px-4 sm:px-8">
            <details>
              <summary className="cursor-pointer text-[13px] text-muted">Preview labels ({s.labels.length})</summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{s.labels.map((l) => <Label key={l.id} l={l} />)}</div>
            </details>
          </section>
        </>
      )}

      {props.fresh.length > 0 && (
        <section className="px-4 pt-8 sm:px-8">
          <h3 className="display text-[19px]">Made fresh on the day</h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {props.fresh.map((l) => (
              <li key={l.id} className="panel px-3.5 py-2.5 text-[13px]">
                <Link href={`/recipes/${l.recipeId}`} className="hover:text-forest">{l.title}</Link>
                <p className="text-[11.5px] text-muted">{SLOT_LABEL[l.slot]} · {formatDay(l.date, { weekday: "long" })} · {grams(l.weight)}</p>
                {l.warning && <p className="mt-0.5 text-[11.5px] text-amber">{l.warning}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {cooking && s && <CookingMode s={s} done={done} onToggle={toggle} onClose={() => setCooking(false)} />}
    </div>
  );
}
