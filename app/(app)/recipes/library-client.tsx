"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Globe, Heart, Search, Star } from "lucide-react";
import { RecipePhoto } from "@/components/photo";
import { Empty, PageHeader, SourceBadge } from "@/components/ui";
import type { RecipeSummary } from "@/components/meal-card";
import { fmt } from "@/lib/nutrition/targets";
import { cn, SLOT_LABEL } from "@/lib/util";
import type { MealSlot } from "@/lib/types";

export interface LibraryItem extends RecipeSummary {
  description: string;
  categories: string[];
  slots: MealSlot[];
  proteins: string[];
  ingredientNames: string[];
  sourceKind: string;
  sourceName: string;
  mealPrep: boolean;
  favorite: boolean;
  rating?: number;
  hidden: boolean;
}

const PROTEIN_LABEL: Record<string, string> = {
  chicken: "Chicken", turkey: "Turkey", beef: "Beef", shrimp: "Shrimp", "white-fish": "White fish", salmon: "Salmon", tuna: "Tuna", egg: "Eggs", dairy: "Dairy",
};

type Sort = "relevance" | "protein-density" | "kcal" | "time";

/**
 * Plain-language query parsing: "high protein chicken under 20 min", "less than 300 kcal",
 * "low carb breakfast", "meal prep fish". Unrecognised words search titles and ingredients.
 */
function parseQuery(q: string) {
  let s = ` ${q.toLowerCase()} `;
  const rules: ((i: LibraryItem) => boolean)[] = [];
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => (i: LibraryItem) => boolean) => {
    const m = s.match(re);
    if (m) { rules.push(fn(m)); s = s.replace(re, " "); }
  };
  take(/(?:under|less than|<|max(?:imum)?|at most)\s*(\d+)\s*(?:min|mins|minutes)\b/, (m) => (i) => i.prepMin + i.cookMin <= Number(m[1]));
  take(/(?:under|less than|<|at most)\s*(\d+)\s*(?:kcal|cal|calories)\b/, (m) => (i) => i.per.kcal <= Number(m[1]));
  take(/(?:over|more than|>|at least)\s*(\d+)\s*g?\s*protein\b/, (m) => (i) => i.per.protein >= Number(m[1]));
  take(/\bhigh[- ]protein\b/, () => (i) => (i.per.protein * 4) / Math.max(i.per.kcal, 1) >= 0.5);
  take(/\blow[- ]carb\b/, () => (i) => i.per.carbs <= 15);
  take(/\blow[- ]fat\b/, () => (i) => i.per.fat <= 6);
  take(/\bhigh[- ]fib(?:re|er)\b/, () => (i) => i.per.fiber >= 6);
  take(/\b(?:quick|fast)\b/, () => (i) => i.prepMin + i.cookMin <= 20);
  take(/\bmeal[- ]prep\b|\bbatch\b/, () => (i) => i.mealPrep);
  take(/\bfavou?rites?\b/, () => (i) => i.favorite);
  take(/\bfish\b/, () => (i) => i.proteins.some((p) => ["white-fish", "salmon", "tuna"].includes(p)));
  take(/\bseafood\b/, () => (i) => i.proteins.some((p) => ["white-fish", "salmon", "tuna", "shrimp"].includes(p)));
  for (const slot of ["breakfast", "lunch", "dinner", "snack"] as const) take(new RegExp(`\\b${slot}s?\\b`), () => (i) => i.slots.includes(slot));
  const words = s.split(/\s+/).filter((w) => w.length > 1 && !["with", "and", "the", "for", "recipes", "recipe", "meals", "meal", "a"].includes(w));
  return (i: LibraryItem) => {
    if (!rules.every((r) => r(i))) return 0;
    if (!words.length) return 1;
    const hay = `${i.title} ${i.description} ${i.cuisine} ${i.categories.join(" ")} ${i.ingredientNames.join(" ")} ${i.proteins.join(" ")}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      const stem = w.replace(/s$/, "");
      if (i.title.toLowerCase().includes(stem)) score += 3;
      else if (hay.includes(stem)) score += 1;
      else return 0;
    }
    return score;
  };
}

export function LibraryClient({ items }: { items: LibraryItem[] }) {
  const [q, setQ] = useState("");
  const [slot, setSlot] = useState<MealSlot | "all">("all");
  const [protein, setProtein] = useState<string>("all");
  const [cuisine, setCuisine] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [favOnly, setFavOnly] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [sort, setSort] = useState<Sort>("relevance");

  const cuisines = useMemo(() => [...new Set(items.map((i) => i.cuisine))].sort(), [items]);
  const proteins = useMemo(() => Object.keys(PROTEIN_LABEL).filter((p) => items.some((i) => i.proteins.includes(p))), [items]);

  const list = useMemo(() => {
    const match = parseQuery(q);
    const scored = items
      .map((i) => ({ i, s: match(i) }))
      .filter(({ i, s }) => s > 0
        && (slot === "all" || i.slots.includes(slot))
        && (protein === "all" || i.proteins.includes(protein))
        && (cuisine === "all" || i.cuisine === cuisine)
        && (source === "all" || i.sourceKind === source)
        && (!favOnly || i.favorite)
        && (showHidden || !i.hidden));
    const density = (i: LibraryItem) => (i.per.protein * 4) / Math.max(i.per.kcal, 1);
    scored.sort((a, b) =>
      sort === "protein-density" ? density(b.i) - density(a.i)
        : sort === "kcal" ? a.i.per.kcal - b.i.per.kcal
          : sort === "time" ? a.i.prepMin + a.i.cookMin - (b.i.prepMin + b.i.cookMin)
            : b.s - a.s || Number(b.i.favorite) - Number(a.i.favorite) || a.i.title.localeCompare(b.i.title));
    return scored.map((x) => x.i);
  }, [items, q, slot, protein, cuisine, source, favOnly, showHidden, sort]);

  const hiddenCount = items.filter((i) => i.hidden).length;
  const sel = "field h-8 !w-auto py-0 pr-8 text-[12.5px]";

  return (
    <div className="rise">
      <PageHeader eyebrow="Recipe library" title="Recipes" sub={`${items.length} recipes. Nutrition is computed from USDA ingredient data at the weights listed; portions in your plan are scaled to your targets.`}>
        <Link href="/recipes/discover" className="btn btn-primary"><Globe size={15} />Find recipes online</Link>
      </PageHeader>

      <div className="z-20 border-b sm:sticky sm:top-0 hairline bg-ivory/95 px-4 py-3 backdrop-blur sm:px-8">
        <label className="relative block">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="field pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder='Try "high protein chicken under 20 min" or "low carb breakfast"' aria-label="Search recipes" />
        </label>
        <div className="-mx-4 mt-2.5 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&>*]:shrink-0">
          {(["all", "breakfast", "lunch", "dinner", "snack"] as const).map((s) => (
            <button key={s} className={cn("chip", slot === s && "chip-on")} onClick={() => setSlot(s)}>{s === "all" ? "All meals" : SLOT_LABEL[s]}</button>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
          <select className={sel} value={protein} onChange={(e) => setProtein(e.target.value)} aria-label="Protein">
            <option value="all">Any protein</option>{proteins.map((p) => <option key={p} value={p}>{PROTEIN_LABEL[p]}</option>)}
          </select>
          <select className={sel} value={cuisine} onChange={(e) => setCuisine(e.target.value)} aria-label="Cuisine">
            <option value="all">Any cuisine</option>{cuisines.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className={sel} value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source">
            <option value="all">Any source</option><option value="house">House recipes</option><option value="web">Imported</option><option value="modified">Adapted</option><option value="user">Personal</option>
          </select>
          <select className={sel} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="relevance">Best match</option><option value="protein-density">Most protein per kcal</option><option value="kcal">Lowest kcal</option><option value="time">Quickest</option>
          </select>
          <button className={cn("chip", favOnly && "chip-on")} onClick={() => setFavOnly((v) => !v)}><Heart size={12} />Favourites</button>
          {hiddenCount > 0 && <button className={cn("chip", showHidden && "chip-on")} onClick={() => setShowHidden((v) => !v)}>Show {hiddenCount} hidden</button>}
        </div>
      </div>

      <div className="px-4 py-6 sm:px-8">
        <p className="mb-4 text-[12px] text-muted">{list.length} {list.length === 1 ? "recipe" : "recipes"} · values per serving</p>
        {list.length === 0 ? (
          <Empty title="Nothing matches" action={<Link href={`/recipes/discover${q ? `?q=${encodeURIComponent(q)}` : ""}`} className="btn btn-secondary"><Globe size={15} />Search reputable sites instead</Link>}>
            Loosen a filter, or look for this online and import it with its source credited.
          </Empty>
        ) : (
          <ul className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {list.map((r) => (
              <li key={r.id}>
                <Link href={`/recipes/${r.id}`} className="group block">
                  <div className="relative">
                    <RecipePhoto photo={r.photo} title={r.title} className="aspect-[4/3] w-full rounded-[8px] transition-transform duration-500 group-hover:scale-[1.01]" />
                    {r.favorite && <span className="absolute right-2.5 top-2.5 grid size-7 place-items-center rounded-full bg-paper/90 text-clay"><Heart size={14} fill="currentColor" /></span>}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-muted">
                    <span>{r.cuisine}</span><span aria-hidden>·</span><span>{r.prepMin + r.cookMin} min</span>
                    {r.mealPrep && <><span aria-hidden>·</span><span>Batch friendly</span></>}
                    {r.rating ? <span className="ml-auto flex items-center gap-0.5 normal-case tracking-normal"><Star size={11} fill="currentColor" className="text-amber" />{r.rating}</span> : null}
                  </div>
                  <h2 className="display mt-1 text-[20px] leading-snug group-hover:text-forest">{r.title}</h2>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">{r.description}</p>
                  <div className="tnum mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-2">
                    <span><b className="font-medium text-ink">{fmt(r.per.kcal)}</b> kcal</span>
                    <span><b className="font-medium text-ink">{fmt(r.per.protein)}</b> g protein</span>
                    <span>{fmt(r.per.carbs)} g carbs</span>
                    <span>{fmt(r.per.fat)} g fat</span>
                    {r.sourceKind !== "house" && <SourceBadge kind={r.sourceKind} name={r.sourceName} />}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
