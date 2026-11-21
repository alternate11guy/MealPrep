"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Clock, Lock, LockOpen, Minus, MoreHorizontal, Plus, RefreshCw, SkipForward, Trash2, Undo2, BookOpen, Scale } from "lucide-react";
import { RecipePhoto } from "./photo";
import { ReplaceDialog } from "./replace-dialog";
import { removeMealAction, setMealStatusAction, setServingsAction, toggleLockAction } from "@/app/actions/plan";
import { useErrorToast } from "./dialog";
import { SLOT_LABEL, cn } from "@/lib/util";
import type { PlannedMeal, Photo } from "@/lib/types";

export interface RecipeSummary {
  id: string;
  title: string;
  photo: Photo;
  cuisine: string;
  prepMin: number;
  cookMin: number;
  per: { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
  portionWeight: number; // cooked grams per serving
}

const STATUS: Record<PlannedMeal["status"], { label: string; cls: string }> = {
  planned: { label: "Planned", cls: "text-muted" },
  prepared: { label: "Prepared", cls: "text-olive" },
  eaten: { label: "Eaten", cls: "text-forest" },
  skipped: { label: "Skipped", cls: "text-faint line-through" },
};

export function MealCard({ meal, recipe, weekId, date, variant = "full", draggable }: {
  meal: PlannedMeal; recipe?: RecipeSummary; weekId: string; date: string; variant?: "full" | "compact"; draggable?: boolean;
}) {
  const [pending, start] = useTransition();
  const [menu, setMenu] = useState(false);
  const [portion, setPortion] = useState(false);
  const [replace, setReplace] = useState(false);
  const onError = useErrorToast();
  const run = (fn: () => Promise<unknown>) => start(async () => { try { await fn(); } catch (e) { onError(e); } });

  if (!recipe) {
    return <div className="rounded-[6px] border border-dashed border-line-strong p-3 text-[12px] text-muted">Recipe no longer available. <button className="underline" onClick={() => run(() => removeMealAction(weekId, date, meal.id))}>Remove</button></div>;
  }
  const s = meal.servings;
  const m = { kcal: recipe.per.kcal * s, protein: recipe.per.protein * s, carbs: recipe.per.carbs * s, fat: recipe.per.fat * s };
  const st = STATUS[meal.status];

  const actions = (
    <div className="flex flex-wrap gap-1.5">
      {meal.status !== "eaten" ? (
        <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => setMealStatusAction(weekId, date, meal.id, "eaten"))}><Check size={14} />Mark eaten</button>
      ) : (
        <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => setMealStatusAction(weekId, date, meal.id, "planned"))}><Undo2 size={14} />Undo</button>
      )}
      <button className="btn btn-secondary btn-sm" onClick={() => setPortion((v) => !v)} aria-expanded={portion}><Scale size={14} />Portion</button>
      <button className="btn btn-secondary btn-sm" onClick={() => setReplace(true)}><RefreshCw size={14} />Replace</button>
      <div className="relative">
        <button className="btn btn-ghost btn-sm" aria-label="More actions" aria-expanded={menu} onClick={() => setMenu((v) => !v)}><MoreHorizontal size={16} /></button>
        {menu && (
          <>
            <button className="fixed inset-0 z-10 cursor-default" aria-hidden tabIndex={-1} onClick={() => setMenu(false)} />
            <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-[6px] border hairline bg-card py-1 text-[13px] shadow-lg" role="menu">
              <Link role="menuitem" href={`/recipes/${recipe.id}?servings=${s}`} className="flex items-center gap-2 px-3 py-2 hover:bg-ink/[0.04]"><BookOpen size={14} />View recipe</Link>
              <button role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-ink/[0.04]" onClick={() => { setMenu(false); run(() => toggleLockAction(weekId, date, meal.id)); }}>{meal.locked ? <LockOpen size={14} /> : <Lock size={14} />}{meal.locked ? "Unlock" : "Lock meal"}</button>
              {meal.status !== "skipped" ? (
                <button role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-ink/[0.04]" onClick={() => { setMenu(false); run(() => setMealStatusAction(weekId, date, meal.id, "skipped")); }}><SkipForward size={14} />Skip meal</button>
              ) : (
                <button role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-ink/[0.04]" onClick={() => { setMenu(false); run(() => setMealStatusAction(weekId, date, meal.id, "planned")); }}><Undo2 size={14} />Restore meal</button>
              )}
              {meal.status === "planned" && (
                <button role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-ink/[0.04]" onClick={() => { setMenu(false); run(() => setMealStatusAction(weekId, date, meal.id, "prepared")); }}><Check size={14} />Mark prepared</button>
              )}
              <button role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left text-clay hover:bg-clay-soft" onClick={() => { setMenu(false); run(() => removeMealAction(weekId, date, meal.id)); }}><Trash2 size={14} />Remove</button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  const portionEditor = portion && (
    <div className="flex items-center gap-2 rounded-[6px] bg-ivory px-2 py-1.5">
      <span className="text-[12px] text-muted">Servings</span>
      <button className="btn btn-ghost btn-sm px-2" aria-label="Less" disabled={pending || s <= 0.25} onClick={() => run(() => setServingsAction(weekId, date, meal.id, Math.max(0.25, Math.round((s - 0.25) * 4) / 4)))}><Minus size={14} /></button>
      <span className="tnum w-10 text-center text-[13px] font-medium">{s}</span>
      <button className="btn btn-ghost btn-sm px-2" aria-label="More" disabled={pending} onClick={() => run(() => setServingsAction(weekId, date, meal.id, Math.round((s + 0.25) * 4) / 4))}><Plus size={14} /></button>
      <span className="tnum ml-auto text-[12px] text-muted">{Math.round(recipe.portionWeight * s)} g cooked</span>
    </div>
  );

  if (variant === "compact") {
    return (
      <div draggable={draggable && !meal.locked} onDragStart={(e) => { e.dataTransfer.setData("text/meal", JSON.stringify({ mealId: meal.id, date })); e.dataTransfer.effectAllowed = "copyMove"; }}
        className={cn("group overflow-hidden rounded-[6px] border hairline bg-card transition-shadow hover:shadow-[0_6px_20px_-12px_rgba(31,33,28,0.35)]", meal.status === "skipped" && "opacity-55", pending && "opacity-60", draggable && !meal.locked && "cursor-grab active:cursor-grabbing")}>
        <div className="relative">
          <RecipePhoto photo={recipe.photo} title={recipe.title} className="aspect-[16/9] w-full" credit={false} small />
          <span className="absolute left-2 top-2 rounded-[3px] bg-paper/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-2">{SLOT_LABEL[meal.slot]}</span>
          {meal.locked && <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-paper/90" title="Locked"><Lock size={12} /></span>}
        </div>
        <div className="space-y-2 p-2.5">
          <Link href={`/recipes/${recipe.id}?servings=${s}`} className="display line-clamp-2 block text-[15px] leading-snug hover:text-forest">{recipe.title}</Link>
          <div className="tnum grid grid-cols-4 gap-1 text-center text-[10.5px] text-muted">
            <span><b className="block text-[12px] font-medium text-ink">{Math.round(m.kcal)}</b>kcal</span>
            <span><b className="block text-[12px] font-medium text-ink">{Math.round(m.protein)}</b>P</span>
            <span><b className="block text-[12px] font-medium text-ink">{Math.round(m.carbs)}</b>C</span>
            <span><b className="block text-[12px] font-medium text-ink">{Math.round(m.fat)}</b>F</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className={st.cls}>{st.label}</span>
            <span className="tnum text-muted">×{s} · {Math.round(recipe.portionWeight * s)} g</span>
          </div>
          <div className="flex gap-1">
            <button className="btn btn-ghost btn-sm flex-1 px-1" title={meal.status === "eaten" ? "Undo" : "Mark eaten"} disabled={pending} onClick={() => run(() => setMealStatusAction(weekId, date, meal.id, meal.status === "eaten" ? "planned" : "eaten"))}>{meal.status === "eaten" ? <Undo2 size={14} /> : <Check size={14} />}</button>
            <button className="btn btn-ghost btn-sm flex-1 px-1" title="Replace" onClick={() => setReplace(true)}><RefreshCw size={14} /></button>
            <button className="btn btn-ghost btn-sm flex-1 px-1" title={meal.locked ? "Unlock" : "Lock"} disabled={pending} onClick={() => run(() => toggleLockAction(weekId, date, meal.id))}>{meal.locked ? <LockOpen size={14} /> : <Lock size={14} />}</button>
            <button className="btn btn-ghost btn-sm flex-1 px-1" title="Portion" onClick={() => setPortion((v) => !v)}><Scale size={14} /></button>
            <button className="btn btn-ghost btn-sm flex-1 px-1 hover:text-clay" title="Remove" disabled={pending} onClick={() => run(() => removeMealAction(weekId, date, meal.id))}><Trash2 size={14} /></button>
          </div>
          {portionEditor}
        </div>
        <ReplaceDialog open={replace} onClose={() => setReplace(false)} weekId={weekId} date={date} mealId={meal.id} currentTitle={recipe.title} />
      </div>
    );
  }

  return (
    <article className={cn("grid grid-cols-[104px_1fr] gap-4 sm:grid-cols-[168px_1fr]", meal.status === "skipped" && "opacity-60", pending && "opacity-70")}>
      <Link href={`/recipes/${recipe.id}?servings=${s}`} className="block">
        <RecipePhoto photo={recipe.photo} title={recipe.title} className="aspect-square w-full rounded-[6px] sm:aspect-[4/3]" credit={false} />
      </Link>
      <div className="min-w-0 space-y-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          <span className="eyebrow text-forest">{SLOT_LABEL[meal.slot]}</span>
          <span className={cn("font-medium", st.cls)}>{st.label}</span>
          {meal.locked && <span className="flex items-center gap-1 text-muted"><Lock size={11} />Locked</span>}
        </div>
        <Link href={`/recipes/${recipe.id}?servings=${s}`} className="display block text-[20px] leading-snug hover:text-forest">{recipe.title}</Link>
        <div className="tnum flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
          <span><b className="font-medium text-ink">{Math.round(m.kcal)}</b> kcal</span>
          <span>P <b className="font-medium text-ink">{Math.round(m.protein)}</b> g</span>
          <span>C <b className="font-medium text-ink">{Math.round(m.carbs)}</b> g</span>
          <span>F <b className="font-medium text-ink">{Math.round(m.fat)}</b> g</span>
          <span className="flex items-center gap-1 text-muted"><Clock size={12} />{recipe.prepMin + recipe.cookMin} min</span>
          <span className="text-muted">{Math.round(recipe.portionWeight * s)} g portion</span>
        </div>
        {actions}
        {portionEditor}
      </div>
      <ReplaceDialog open={replace} onClose={() => setReplace(false)} weekId={weekId} date={date} mealId={meal.id} currentTitle={recipe.title} />
    </article>
  );
}
