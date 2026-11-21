"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, CalendarPlus, Copy, ExternalLink, Heart, Minus, Plus, Sparkles, Star, Trash2 } from "lucide-react";
import { RecipePhoto } from "@/components/photo";
import { StepTimer } from "@/components/step-timer";
import { Dialog, toast, useErrorToast } from "@/components/dialog";
import { Notice, SourceBadge } from "@/components/ui";
import { addMealAction } from "@/app/actions/plan";
import { deleteRecipeAction, duplicateRecipeAction, saveFeedbackAction } from "@/app/actions/data";
import { modifyRecipeAction } from "@/app/actions/ai";
import { fmt } from "@/lib/nutrition/targets";
import { cn, formatDay, grams, money, SLOT_LABEL } from "@/lib/util";
import type { FeedbackTag, MealSlot, NutrientKey, Photo, PriceEntry, Recipe } from "@/lib/types";

export interface IngredientRow {
  id: string; name: string; grams: number; note?: string; group?: string;
  unit?: { label: string; grams: number }; yieldFactor?: number; yieldBasis?: string; staple: boolean;
  nutrients: Record<NutrientKey, number>; missing: NutrientKey[]; known: boolean;
  ndb?: string; usda?: string; usdaUrl?: string; price?: { perKg: number; kind: PriceEntry["kind"] }; labelNote?: string;
}

type RecipeView = Pick<Recipe, "id" | "title" | "description" | "cuisine" | "categories" | "slots" | "prepMin" | "cookMin" | "servings" | "steps" | "equipment" | "substitutions" | "storage" | "reheating" | "mealPrep" | "source" | "originalLines"> & { photo: Photo };

const MICROS: { key: NutrientKey; label: string; unit: string; digits?: number }[] = [
  { key: "fiber", label: "Fibre", unit: "g", digits: 1 },
  { key: "sugar", label: "Sugars", unit: "g", digits: 1 },
  { key: "satFat", label: "Saturated fat", unit: "g", digits: 1 },
  { key: "sodium", label: "Sodium", unit: "mg" },
  { key: "potassium", label: "Potassium", unit: "mg" },
  { key: "calcium", label: "Calcium", unit: "mg" },
  { key: "iron", label: "Iron", unit: "mg", digits: 1 },
  { key: "vitC", label: "Vitamin C", unit: "mg", digits: 1 },
  { key: "vitD", label: "Vitamin D", unit: "µg", digits: 1 },
  { key: "b12", label: "Vitamin B12", unit: "µg", digits: 1 },
];

const TAGS: { tag: FeedbackTag; label: string }[] = [
  { tag: "loved", label: "Loved it" }, { tag: "again", label: "Make again" }, { tag: "difficult", label: "Too much work" },
  { tag: "expensive", label: "Too expensive" }, { tag: "disliked", label: "Didn't enjoy" }, { tag: "never", label: "Never suggest" },
];

const PRESETS = ["Lower the fat without losing protein", "Make it dairy-free", "Use tilapia instead of the main protein", "Add more vegetables and fibre", "Make it spicier, Egyptian style", "Cut prep time to under 20 minutes"];

const PRICE_KIND: Record<string, string> = { manual: "your price", verified: "verified", estimate: "estimate", demo: "demo price" };

function unitHint(g: number, unit?: { label: string; grams: number }) {
  if (!unit) return null;
  const n = g / unit.grams;
  if (n < 0.4) return null;
  const r = Math.round(n * 2) / 2;
  return `≈ ${fmt(r, r % 1 ? 1 : 0)} × ${unit.label}`;
}

export function RecipeClient(props: {
  recipe: RecipeView; rows: IngredientRow[]; cookedWeight: number; rawWeight: number;
  energy: { macroKcal: number; diffPct: number; ok: boolean };
  parent?: { id: string; title: string }; variants: { id: string; title: string; summary?: string }[]; deletable: boolean;
  feedback: { tags: FeedbackTag[]; rating?: number; favorite: boolean }; currency: string; weekId: string; weekDates: string[]; citation: string;
}) {
  const { recipe: r, rows, currency } = props;
  const router = useRouter();
  const onError = useErrorToast();
  const [pending, start] = useTransition();
  const [servings, setServings] = useState(r.servings);
  const [basis, setBasis] = useState<"serving" | "batch">("serving");
  const [fb, setFb] = useState(props.feedback);
  const [modOpen, setModOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [done, setDone] = useState<Set<number>>(new Set());

  const f = servings / r.servings;
  const total = useMemo(() => {
    const t = {} as Record<NutrientKey, number>;
    for (const row of rows) for (const k of Object.keys(row.nutrients) as NutrientKey[]) t[k] = (t[k] ?? 0) + row.nutrients[k] * f;
    return t;
  }, [rows, f]);
  const div = basis === "serving" ? servings : 1;
  const per = (k: NutrientKey) => (total[k] ?? 0) / div;
  const cost = useMemo(() => {
    let sum = 0; let priced = 0; const kinds = new Set<string>(); let need = 0;
    for (const row of rows) {
      if (row.staple) continue;
      need++;
      if (row.price) { sum += (row.price.perKg * row.grams * f) / 1000; priced++; kinds.add(row.price.kind); }
    }
    return { sum, priced, need, kinds };
  }, [rows, f]);
  const missingAny = rows.filter((x) => x.known && x.missing.some((k) => MICROS.some((m) => m.key === k)));
  const unknown = rows.filter((x) => !x.known);

  const groups = useMemo(() => {
    const m = new Map<string, IngredientRow[]>();
    for (const row of rows) { const g = row.group ?? ""; m.set(g, [...(m.get(g) ?? []), row]); }
    return [...m.entries()];
  }, [rows]);

  const saveFb = (patch: Partial<typeof fb>) => {
    const next = { ...fb, ...patch };
    setFb(next);
    start(async () => { try { await saveFeedbackAction(r.id, patch); } catch (e) { onError(e); } });
  };

  const duplicate = () => start(async () => {
    try { const id = await duplicateRecipeAction(r.id); router.push(`/recipes/${id}`); toast("Copied to your recipes"); } catch (e) { onError(e); }
  });
  const remove = () => {
    if (!confirm("Delete this recipe? Meals already planned with it will show as missing.")) return;
    start(async () => { try { await deleteRecipeAction(r.id); } catch (e) { onError(e); } });
  };

  const tiles: { k: NutrientKey; label: string; unit: string; color: string }[] = [
    { k: "kcal", label: "Energy", unit: "kcal", color: "var(--color-energy)" },
    { k: "protein", label: "Protein", unit: "g", color: "var(--color-protein)" },
    { k: "carbs", label: "Carbohydrate", unit: "g", color: "var(--color-carbs)" },
    { k: "fat", label: "Fat", unit: "g", color: "var(--color-fat)" },
  ];

  return (
    <article className="rise pb-16">
      <div className="no-print px-4 pt-5 sm:px-8"><Link href="/recipes" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink"><ArrowLeft size={14} />Recipe library</Link></div>

      {/* Hero */}
      <header className="grid gap-6 px-4 pt-4 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10">
        <RecipePhoto photo={r.photo} title={r.title} priority className="aspect-[4/3] w-full rounded-[10px]" sizes="(max-width: 1024px) 100vw, 50vw" />
        <div className="flex min-w-0 flex-col">
          <p className="eyebrow">{r.cuisine} · {r.slots.map((s) => SLOT_LABEL[s]).join(", ")}{r.mealPrep && " · Batch friendly"}</p>
          <h1 className="display mt-2 text-[34px] leading-[1.06] sm:text-[44px]">{r.title}</h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink-2">{r.description}</p>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
            <SourceBadge kind={r.source.kind} name={r.source.name} />
            {r.source.kind === "web" && r.source.url && (
              <span>From <a href={r.source.url} target="_blank" rel="noopener noreferrer" className="text-forest underline underline-offset-4">{r.source.name}<ExternalLink size={11} className="ml-0.5 inline -translate-y-px" /></a>{r.source.author && <> by {r.source.author}</>}. Saved for your personal use with credit; the original page is the authoritative version.</span>)}
            {r.source.kind === "house" && <span>Written for this app. Nutrition computed from USDA data.</span>}
            {props.parent && <span>Adapted from <Link href={`/recipes/${props.parent.id}`} className="text-forest underline underline-offset-4">{props.parent.title}</Link>{r.source.modificationSummary && <>: {r.source.modificationSummary}</>}</span>}
          </div>

          <div className="no-print mt-5 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => setPlanOpen(true)}><CalendarPlus size={15} />Add to plan</button>
            <button className={cn("btn btn-secondary", fb.favorite && "text-clay")} onClick={() => saveFb({ favorite: !fb.favorite })} aria-pressed={fb.favorite}><Heart size={15} fill={fb.favorite ? "currentColor" : "none"} />{fb.favorite ? "Favourite" : "Add to favourites"}</button>
            <button className="btn btn-secondary" onClick={() => setModOpen(true)}><Sparkles size={15} />Modify with Claude</button>
            <button className="btn btn-ghost" disabled={pending} onClick={duplicate}><Copy size={15} />Duplicate</button>
            {props.deletable && <button className="btn btn-ghost hover:text-clay" disabled={pending} onClick={remove}><Trash2 size={15} />Delete</button>}
          </div>

          {/* Time strip */}
          <dl className="mt-auto grid grid-cols-4 divide-x divide-line border-y hairline pt-0 text-center max-lg:mt-6">
            <div className="py-3.5">
              <dt className="eyebrow">Serves</dt>
              <dd className="mt-1 flex items-center justify-center gap-1">
                <button className="grid size-6 place-items-center rounded-full border hairline hover:bg-ink/[0.04] disabled:opacity-40" aria-label="Fewer servings" disabled={servings <= 1} onClick={() => setServings((s) => Math.max(1, s - 1))}><Minus size={12} /></button>
                <span className="display tnum w-7 text-[22px]">{servings}</span>
                <button className="grid size-6 place-items-center rounded-full border hairline hover:bg-ink/[0.04]" aria-label="More servings" onClick={() => setServings((s) => Math.min(24, s + 1))}><Plus size={12} /></button>
              </dd>
            </div>
            <div className="py-3.5"><dt className="eyebrow">Ready in</dt><dd className="display tnum mt-1 text-[22px]">{r.prepMin + r.cookMin}<span className="ml-0.5 text-[13px] text-muted">min</span></dd></div>
            <div className="py-3.5"><dt className="eyebrow">Prep</dt><dd className="display tnum mt-1 text-[22px]">{r.prepMin}<span className="ml-0.5 text-[13px] text-muted">min</span></dd></div>
            <div className="py-3.5"><dt className="eyebrow">Cook</dt><dd className="display tnum mt-1 text-[22px]">{r.cookMin}<span className="ml-0.5 text-[13px] text-muted">min</span></dd></div>
          </dl>
        </div>
      </header>

      {/* Nutrition tiles */}
      <section className="px-4 pt-8 sm:px-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="display text-[22px]">Nutrition</h2>
          <div className="flex items-center gap-1.5 text-[12px]">
            <button className={cn("chip", basis === "serving" && "chip-on")} onClick={() => setBasis("serving")}>Per serving</button>
            <button className={cn("chip", basis === "batch" && "chip-on")} onClick={() => setBasis("batch")}>Whole batch ({servings})</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.k} className="panel px-4 py-3.5">
              <div className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: t.color }} /><span className="text-[12px] text-muted">{t.label}</span></div>
              <p className="display tnum mt-1 text-[30px] leading-none">{fmt(per(t.k))}<span className="ml-1 text-[13px] text-muted">{t.unit}</span></p>
              {t.k !== "kcal" && <p className="tnum mt-1.5 text-[11.5px] text-muted">{fmt(((per(t.k) * (t.k === "fat" ? 9 : 4)) / Math.max(per("kcal"), 1)) * 100)}% of energy</p>}
              {t.k === "kcal" && <p className="tnum mt-1.5 text-[11.5px] text-muted">{grams((props.cookedWeight * f) / div)} cooked{basis === "serving" ? " per serving" : ""}</p>}
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">
          Computed from USDA SR28 values for each ingredient at the raw weights below. 4/4/9 check: {fmt(props.energy.macroKcal)} kcal per serving from macros, {props.energy.diffPct >= 0 ? "+" : ""}{fmt(props.energy.diffPct, 1)}% vs database energy{props.energy.ok ? " (consistent)" : ", larger than expected; check ingredient mapping"}.
        </p>
      </section>

      <div className="grid gap-10 px-4 pt-8 sm:px-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        {/* Ingredients */}
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="display text-[22px]">Ingredients</h2>
            <span className="tnum text-[12px] text-muted">{grams(props.rawWeight * f)} raw · {servings} {servings === 1 ? "serving" : "servings"}</span>
          </div>
          {servings !== r.servings && <p className="mb-3 text-[12px] text-muted">Scaled from {r.servings} servings. <button className="text-forest underline underline-offset-4" onClick={() => setServings(r.servings)}>Reset</button></p>}
          {groups.map(([g, list]) => (
            <div key={g} className="mb-4">
              {g && <p className="eyebrow mb-1.5">{g}</p>}
              <ul className="divide-y divide-line border-y hairline">
                {list.map((row, ri) => {
                  const g2 = row.grams * f;
                  return (
                    <li key={`${row.id}-${ri}`} className="flex items-baseline gap-3 py-2.5 text-[13.5px]">
                      <span className="tnum w-16 shrink-0 text-right font-medium">{grams(g2)}</span>
                      <span className="min-w-0 flex-1">
                        {row.name}{row.note && <span className="text-muted">, {row.note}</span>}
                        <span className="block text-[11.5px] text-muted">
                          {[unitHint(g2, row.unit), row.yieldFactor ? `raw weight; cooks to ≈ ${grams(g2 * row.yieldFactor)}` : null, row.staple ? "pantry staple" : null].filter(Boolean).join(" · ")}
                        </span>
                        {row.labelNote && <span className="block text-[11.5px] text-amber">{row.labelNote}</span>}
                        {!row.known && <span className="block text-[11.5px] text-clay">Not matched to a USDA food; excluded from nutrition.</span>}
                      </span>
                      <span className="tnum shrink-0 text-[11.5px] text-muted">{fmt(row.nutrients.kcal * f)} kcal</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <div className="panel mt-4 px-4 py-3 text-[13px]">
            <div className="flex items-baseline justify-between">
              <span className="text-ink-2">Estimated ingredient cost</span>
              <span className="tnum font-medium">{cost.priced ? money(cost.sum, currency) : "–"}</span>
            </div>
            <p className="mt-1 text-[11.5px] text-muted">
              {cost.priced ? <>{money(cost.sum / servings, currency)} per serving · {cost.priced} of {cost.need} items priced ({[...cost.kinds].map((k) => PRICE_KIND[k] ?? k).join(", ")}); pantry staples not counted.</> : <>No prices in {currency} yet. Add them from the grocery list.</>}
            </p>
          </div>
          {r.originalLines?.length ? (
            <details className="mt-4 text-[12.5px]">
              <summary className="cursor-pointer text-muted">Original ingredient lines from the source</summary>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-ink-2">{r.originalLines.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </details>
          ) : null}

          {r.equipment.length > 0 && (
            <div className="mt-8">
              <h3 className="display text-[18px]">Equipment</h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">{r.equipment.map((e) => <li key={e} className="chip">{e}</li>)}</ul>
            </div>
          )}
          {r.substitutions.length > 0 && (
            <div className="mt-8">
              <h3 className="display text-[18px]">Substitutions</h3>
              <ul className="mt-2 space-y-2 text-[13px]">{r.substitutions.map((s, i) => <li key={i}><span className="font-medium">{s.from} → {s.to}.</span> <span className="text-muted">{s.note}</span></li>)}</ul>
            </div>
          )}
        </section>

        {/* Method */}
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="display text-[22px]">Method</h2>
            {done.size > 0 && <button className="text-[12px] text-muted underline underline-offset-4" onClick={() => setDone(new Set())}>Clear ticks</button>}
          </div>
          <ol className="space-y-4">
            {r.steps.map((s, i) => (
              <li key={i} className={cn("flex gap-4", done.has(i) && "opacity-50")}>
                <button onClick={() => setDone((d) => { const n = new Set(d); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                  className={cn("display grid size-8 shrink-0 place-items-center rounded-full border text-[15px] transition-colors", done.has(i) ? "border-forest bg-forest text-ivory" : "hairline bg-card")} aria-label={`Step ${i + 1} ${done.has(i) ? "done" : "not done"}`}>{i + 1}</button>
                <div className="min-w-0 pt-1">
                  <p className="text-[14px] leading-relaxed">{s.text}</p>
                  {s.timerMin ? <div className="mt-2"><StepTimer minutes={s.timerMin} /></div> : null}
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="panel px-4 py-3.5">
              <h3 className="eyebrow">Storage</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed">Fridge up to {r.storage.fridgeDays} {r.storage.fridgeDays === 1 ? "day" : "days"}{r.storage.freezerMonths ? `; freezer up to ${r.storage.freezerMonths} months` : "; does not freeze well"}. {r.storage.note}</p>
            </div>
            <div className="panel px-4 py-3.5">
              <h3 className="eyebrow">Reheating</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed">{r.reheating}</p>
            </div>
          </div>

          {/* Feedback */}
          <div className="no-print mt-10">
            <h3 className="display text-[18px]">How was it?</h3>
            <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} role="radio" aria-checked={fb.rating === n} aria-label={`${n} stars`} onClick={() => saveFb({ rating: fb.rating === n ? 0 : n })} className="p-0.5 text-amber">
                  <Star size={20} fill={(fb.rating ?? 0) >= n ? "currentColor" : "none"} strokeWidth={1.5} />
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {TAGS.map(({ tag, label }) => (
                <button key={tag} className={cn("chip", fb.tags.includes(tag) && "chip-on")} onClick={() => saveFb({ tags: fb.tags.includes(tag) ? fb.tags.filter((t) => t !== tag) : [...fb.tags, tag] })}>{label}</button>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-muted">The planner uses this: loved and make-again recipes come up more; disliked and never-suggest ones are left out of new plans.</p>
          </div>

          {props.variants.length > 0 && (
            <div className="mt-10">
              <h3 className="display text-[18px]">Your adapted versions</h3>
              <ul className="mt-2 space-y-1.5 text-[13px]">{props.variants.map((v) => <li key={v.id}><Link href={`/recipes/${v.id}`} className="text-forest underline underline-offset-4">{v.title}</Link>{v.summary && <span className="text-muted"> · {v.summary}</span>}</li>)}</ul>
            </div>
          )}
        </section>
      </div>

      {/* Full nutrition */}
      <section className="px-4 pt-10 sm:px-8">
        <details className="panel group px-4 py-3.5">
          <summary className="flex cursor-pointer items-baseline justify-between text-[14px]"><span className="display text-[18px]">Full nutrition and data sources</span><span className="text-[12px] text-muted group-open:hidden">Show</span></summary>
          <div className="mt-4 grid gap-8 lg:grid-cols-2">
            <table className="w-full text-[13px]">
              <caption className="mb-2 text-left text-[12px] text-muted">{basis === "serving" ? "Per serving" : `Whole batch (${servings} servings)`}</caption>
              <tbody className="divide-y divide-line">
                {MICROS.map((m) => {
                  const gap = rows.some((x) => x.known && x.missing.includes(m.key) && x.grams > 0);
                  return (
                    <tr key={m.key}><td className="py-1.5 text-ink-2">{m.label}</td><td className="tnum py-1.5 text-right">{fmt(per(m.key), m.digits ?? 0)} {m.unit}{gap && <span className="text-amber" title="At least one ingredient has no value for this nutrient"> *</span>}</td></tr>
                  );
                })}
              </tbody>
            </table>
            <div className="text-[12px] leading-relaxed text-muted">
              <p className="font-medium text-ink-2">Ingredient matches</p>
              <ul className="mt-1.5 space-y-1">
                {rows.map((x, xi) => <li key={`${x.id}-${xi}`}><span className="text-ink-2">{x.name}</span> → {x.usda ? <a href={x.usdaUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{x.usda} (NDB {x.ndb})</a> : "no match"}{x.yieldBasis && <span> · yield: {x.yieldBasis}</span>}</li>)}
              </ul>
              {missingAny.length > 0 && <p className="mt-3"><span className="text-amber">*</span> Some ingredients have no value in the database for that nutrient, so the total is a lower bound.</p>}
              {unknown.length > 0 && <p className="mt-2 text-clay">{unknown.length} ingredient(s) could not be matched and are not counted.</p>}
              <p className="mt-3">Source: {props.citation}</p>
            </div>
          </div>
        </details>
      </section>

      <ModifyDialog open={modOpen} onClose={() => setModOpen(false)} recipeId={r.id} title={r.title} />
      <PlanDialog open={planOpen} onClose={() => setPlanOpen(false)} recipeId={r.id} slots={r.slots} weekId={props.weekId} dates={props.weekDates} />
    </article>
  );
}

function ModifyDialog({ open, onClose, recipeId, title }: { open: boolean; onClose: () => void; recipeId: string; title: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const submit = () => start(async () => {
    setError(null);
    const res = await modifyRecipeAction(recipeId, text);
    if (!res.ok) { setError(res.error); return; }
    toast(res.data.dropped ? `Saved. ${res.data.dropped} ingredient(s) couldn't be matched and were left out.` : "Adapted version saved");
    onClose();
    router.push(`/recipes/${res.data.id}`);
  });
  return (
    <Dialog open={open} onClose={onClose} title="Modify with Claude"
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={pending || text.trim().length < 3} onClick={submit}><Sparkles size={15} />{pending ? "Adapting…" : "Create adapted version"}</button></>}>
      <p className="text-[13px] leading-relaxed text-ink-2">Claude rewrites <i>{title}</i> as a new recipe. The original stays as it is and is linked from the new version. Every ingredient is re-matched to USDA data and the nutrition recalculated; nothing Claude estimates is used for numbers.</p>
      <label className="mt-4 block">
        <span className="label">What should change?</span>
        <textarea className="field min-h-24" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Make it dairy-free and use shrimp instead of chicken" />
      </label>
      <div className="mt-2 flex flex-wrap gap-1.5">{PRESETS.map((p) => <button key={p} className="chip" onClick={() => setText(p)}>{p}</button>)}</div>
      {error && <Notice tone="caution" className="mt-4">{error}</Notice>}
    </Dialog>
  );
}

function PlanDialog({ open, onClose, recipeId, slots, weekId, dates }: { open: boolean; onClose: () => void; recipeId: string; slots: MealSlot[]; weekId: string; dates: string[] }) {
  const router = useRouter();
  const onError = useErrorToast();
  const [date, setDate] = useState(dates[0] ?? "");
  const [slot, setSlot] = useState<MealSlot>(slots[0] ?? "lunch");
  const [servings, setServings] = useState(1);
  const [pending, start] = useTransition();
  const submit = () => start(async () => {
    try {
      await addMealAction(weekId, date, slot, recipeId, servings);
      toast("Added to your plan");
      onClose();
      router.push(`/plan?day=${date}`);
    } catch (e) { onError(e); }
  });
  return (
    <Dialog open={open} onClose={onClose} title="Add to this week's plan"
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={pending || !date} onClick={submit}>Add meal</button></>}>
      {dates.length === 0 ? <p className="text-[13px] text-muted">This week has no days left. Open next week in the planner to add it there.</p> : (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block"><span className="label">Day</span><select className="field" value={date} onChange={(e) => setDate(e.target.value)}>{dates.map((d) => <option key={d} value={d}>{formatDay(d, { weekday: "long", day: "numeric", month: "short" })}</option>)}</select></label>
          <label className="block"><span className="label">Meal</span><select className="field" value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)}>{(["breakfast", "lunch", "dinner", "snack"] as MealSlot[]).map((s) => <option key={s} value={s}>{SLOT_LABEL[s]}</option>)}</select></label>
          <label className="block"><span className="label">Servings</span><input type="number" min={0.25} max={4} step={0.25} className="field tnum" value={servings} onChange={(e) => setServings(Number(e.target.value) || 1)} /></label>
          <p className="text-[12px] text-muted sm:col-span-3">After adding, use Rebalance portions on that day to bring it back to your targets.</p>
        </div>
      )}
    </Dialog>
  );
}
