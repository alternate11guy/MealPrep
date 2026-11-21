// Recipe discovery and import.
//
// Import reads schema.org/Recipe structured data (JSON-LD) that publishers embed for search
// engines, respects robots.txt, and keeps the source name, author and URL. Imported photos are
// shown as "source" images linked back to the publisher. Nutrition is never taken from the
// page: ingredients are mapped to USDA foods and recalculated (the publisher's own figures,
// when present, are kept only for comparison).

import { searchFoods } from "@/lib/nutrition/foods";
import { INGREDIENTS } from "@/lib/nutrition/ingredients";
import { uid } from "@/lib/util";
import type { MealSlot, Recipe, RecipeIngredient } from "@/lib/types";

export const REPUTABLE_DOMAINS = [
  "bbcgoodfood.com", "eatingwell.com", "skinnytaste.com", "seriouseats.com", "allrecipes.com",
  "themediterraneandish.com", "recipetineats.com", "bonappetit.com", "cooking.nytimes.com", "food52.com",
  "simplyrecipes.com", "budgetbytes.com", "loveandlemons.com", "feelgoodfoodie.net", "cookieandkate.com",
];

const UA = "MiseRecipeImporter/1.0 (private, single-user meal planner; fetches one page on request)";

export interface ImportedRecipe {
  title: string;
  description: string;
  url: string;
  siteName: string;
  author?: string;
  image?: string;
  servings: number;
  prepMin: number;
  cookMin: number;
  ingredientLines: string[];
  steps: string[];
  cuisine?: string;
  category?: string;
  statedNutrition?: Record<string, string>;
}

function isoMinutes(d?: string): number {
  if (!d || typeof d !== "string") return 0;
  const m = d.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return 0;
  return (Number(m[1] ?? 0) * 1440) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
}

function text(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === "object" && v && "name" in v) return text((v as { name: unknown }).name);
  return "";
}

function instructions(v: unknown): string[] {
  if (!v) return [];
  if (typeof v === "string") return v.split(/\n+|(?<=\.)\s+(?=[A-Z])/).map(text).filter(Boolean);
  if (Array.isArray(v)) return v.flatMap(instructions);
  if (typeof v === "object" && v) {
    const o = v as Record<string, unknown>;
    if (o.itemListElement) return instructions(o.itemListElement);
    if (o.text) return [text(o.text)];
    if (o.name) return [text(o.name)];
  }
  return [];
}

function findRecipe(node: unknown): Record<string, unknown> | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const n of node) { const r = findRecipe(n); if (r) return r; }
    return null;
  }
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    const t = o["@type"];
    if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return o;
    if (o["@graph"]) return findRecipe(o["@graph"]);
  }
  return null;
}

async function robotsAllows(url: URL) {
  try {
    const res = await fetch(`${url.origin}/robots.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return true;
    const lines = (await res.text()).split(/\r?\n/);
    let applies = false;
    const disallow: string[] = [];
    for (const raw of lines) {
      const line = raw.split("#")[0].trim();
      const [k, ...rest] = line.split(":");
      const v = rest.join(":").trim();
      if (/^user-agent$/i.test(k)) applies = v === "*" || /mise/i.test(v);
      else if (applies && /^disallow$/i.test(k) && v) disallow.push(v);
    }
    return !disallow.some((p) => url.pathname.startsWith(p.replace(/\*.*$/, "")));
  } catch {
    return true;
  }
}

export async function fetchRecipeFromUrl(raw: string): Promise<ImportedRecipe> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("That doesn't look like a web address."); }
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http(s) links can be imported.");
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(url.hostname) || url.hostname.endsWith(".local")) throw new Error("Private network addresses can't be imported.");
  if (!(await robotsAllows(url))) throw new Error(`${url.hostname} asks automated tools not to read this page (robots.txt). Open it in your browser and add the recipe manually.`);
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(12000), redirect: "follow" });
  if (!res.ok) throw new Error(`The site answered ${res.status}. It may block automated access.`);
  const html = (await res.text()).slice(0, 3_000_000);
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  let recipe: Record<string, unknown> | null = null;
  for (const b of blocks) {
    try { recipe = findRecipe(JSON.parse(b.trim())); } catch { /* skip malformed block */ }
    if (recipe) break;
  }
  if (!recipe) throw new Error("This page doesn't publish structured recipe data, so it can't be imported automatically.");
  const site = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i)?.[1] ?? url.hostname.replace(/^www\./, "");
  const img = recipe.image;
  const image = typeof img === "string" ? img : Array.isArray(img) ? (typeof img[0] === "string" ? img[0] : (img[0] as { url?: string })?.url) : (img as { url?: string } | undefined)?.url;
  const yieldRaw = Array.isArray(recipe.recipeYield) ? recipe.recipeYield[0] : recipe.recipeYield;
  const servings = Number(String(yieldRaw ?? "").match(/\d+/)?.[0] ?? 2) || 2;
  const nutrition = recipe.nutrition as Record<string, string> | undefined;
  return {
    title: text(recipe.name) || "Untitled recipe",
    description: text(recipe.description).slice(0, 600),
    url: url.toString(),
    siteName: text(site),
    author: text(recipe.author) || undefined,
    image,
    servings: Math.min(24, servings),
    prepMin: isoMinutes(recipe.prepTime as string),
    cookMin: isoMinutes(recipe.cookTime as string) || Math.max(0, isoMinutes(recipe.totalTime as string) - isoMinutes(recipe.prepTime as string)),
    ingredientLines: ((recipe.recipeIngredient as unknown[]) ?? []).map(text).filter(Boolean),
    steps: instructions(recipe.recipeInstructions),
    cuisine: text(recipe.recipeCuisine) || undefined,
    category: text(recipe.recipeCategory) || undefined,
    statedNutrition: nutrition ? Object.fromEntries(Object.entries(nutrition).filter(([k]) => !k.startsWith("@")).map(([k, v]) => [k, String(v)])) : undefined,
  };
}

// --------------------------------------------------------------------------- heuristic mapping

const UNIT_G: Record<string, number> = { g: 1, gram: 1, grams: 1, kg: 1000, oz: 28.35, ounce: 28.35, ounces: 28.35, lb: 453.6, lbs: 453.6, pound: 453.6, pounds: 453.6, ml: 1, l: 1000 };
const VOLUME_ML: Record<string, number> = { cup: 240, cups: 240, tbsp: 15, tablespoon: 15, tablespoons: 15, tsp: 5, teaspoon: 5, teaspoons: 5 };

function parseQty(s: string) {
  const frac: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };
  let t = s.replace(/[½¼¾⅓⅔]/g, (c) => ` ${frac[c]}`);
  t = t.replace(/(\d+)\s*\/\s*(\d+)/g, (_, a, b) => String(Number(a) / Number(b)));
  const m = t.match(/^\s*([\d.]+(?:\s+[\d.]+)?)/);
  if (!m) return null;
  return m[1].split(/\s+/).map(Number).reduce((a, b) => a + b, 0);
}

export interface MappedLine { line: string; ingredientId: string | null; grams: number | null; confidence: "high" | "low" | "none"; label?: string }

/** Best-effort, no-AI mapping. Low-confidence lines are flagged for review. */
export function heuristicMap(lines: string[]): MappedLine[] {
  return lines.map((line) => {
    const lower = line.toLowerCase();
    const qty = parseQty(lower);
    const unitM = lower.match(/^[\s\d./½¼¾⅓⅔]+\s*([a-z]+)/);
    const unit = unitM?.[1];
    let grams: number | null = null;
    let confidence: MappedLine["confidence"] = "low";
    if (qty != null && unit && UNIT_G[unit]) { grams = qty * UNIT_G[unit]; confidence = "high"; }
    else if (qty != null && unit && VOLUME_ML[unit]) grams = qty * VOLUME_ML[unit]; // density unknown
    const catalog = INGREDIENTS.find((i) => i.name.toLowerCase().split(/[ ,(]/).filter((w) => w.length > 3).some((w) => lower.includes(w)));
    if (catalog) {
      if (grams == null && qty != null && catalog.unit) grams = qty * catalog.unit.grams;
      return { line, ingredientId: catalog.id, grams, confidence: grams == null ? "low" : confidence, label: catalog.name };
    }
    const words = lower.replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !(w in VOLUME_ML) && !(w in UNIT_G)).slice(-3).join(" ");
    const f = words ? searchFoods(words, 1)[0] : undefined;
    if (f) return { line, ingredientId: `ndb:${f.ndb}`, grams, confidence: "low", label: f.description };
    return { line, ingredientId: null, grams, confidence: "none" };
  });
}

export function toRecipe(src: ImportedRecipe, mapped: MappedLine[], extra: { slots?: MealSlot[]; categories?: string[] } = {}): Recipe {
  const ingredients: RecipeIngredient[] = mapped
    .filter((m) => m.ingredientId && m.grams && m.grams > 0)
    .map((m) => ({ ingredientId: m.ingredientId!, grams: Math.round(m.grams! * 10) / 10, note: m.confidence !== "high" ? `Review: "${m.line}"` : undefined }));
  return {
    id: uid("web"),
    title: src.title,
    description: src.description,
    source: { kind: "web", name: src.siteName, url: src.url, author: src.author, retrievedAt: new Date().toISOString() },
    photo: src.image ? { kind: "source", url: src.image, credit: src.siteName, sourceUrl: src.url, alt: src.title } : { kind: "placeholder", alt: src.title },
    cuisine: src.cuisine ?? "Imported",
    categories: extra.categories ?? (src.category ? [src.category] : []),
    slots: extra.slots ?? ["lunch", "dinner"],
    prepMin: src.prepMin,
    cookMin: src.cookMin,
    servings: src.servings,
    ingredients,
    originalLines: src.ingredientLines,
    steps: src.steps.map((t) => ({ text: t })),
    equipment: [],
    substitutions: [],
    storage: { fridgeDays: 3, freezerMonths: null, note: "Default guidance for cooked dishes: refrigerate within 2 hours and eat within 3 days. Review for this recipe." },
    reheating: "Reheat until steaming hot throughout, 74 °C (165 °F).",
    mealPrep: true,
  };
}
