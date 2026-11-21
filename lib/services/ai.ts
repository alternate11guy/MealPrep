// Claude integration (server-only). Every function returns null / throws AiUnavailable when no
// ANTHROPIC_API_KEY is configured, and callers fall back to deterministic behaviour.
//
// Claude proposes (recipes, mappings, edits, explanations); the nutrition engine computes.
// Nothing Claude says about nutrient amounts is stored without being recalculated from USDA data.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { INGREDIENTS, getIngredient } from "@/lib/nutrition/ingredients";
import { searchFoods, prettyDescription } from "@/lib/nutrition/foods";
import { recipeNutrition } from "@/lib/nutrition/compute";
import { REPUTABLE_DOMAINS, type ImportedRecipe, type MappedLine } from "./discovery";
import type { PlanContext } from "./planner";
import type { GenerateOptions, MealSlot, Recipe } from "@/lib/types";

export const MODEL = "claude-opus-5-5";

export class AiUnavailable extends Error {
  constructor() { super("Add an Anthropic API key (ANTHROPIC_API_KEY) on the server to use this feature."); }
}

export function aiAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let _client: Anthropic | null = null;
function client() {
  if (!aiAvailable()) throw new AiUnavailable();
  _client ??= new Anthropic();
  return _client;
}

const catalogList = () => INGREDIENTS.map((i) => `${i.id}: ${i.name}`).join("\n");

async function parse<T extends z.ZodType>(schema: T, system: string, content: Anthropic.MessageParam["content"], effort: "low" | "medium" | "high" = "medium", maxTokens = 8000): Promise<z.infer<T>> {
  const res = await client().messages.parse({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    output_config: { format: zodOutputFormat(schema), effort },
    messages: [{ role: "user", content }],
  });
  if (res.stop_reason === "refusal") throw new Error("Claude declined this request.");
  if (!res.parsed_output) throw new Error("Claude's answer couldn't be read. Please try again.");
  return res.parsed_output as z.infer<T>;
}

// ------------------------------------------------------------------ plan proposals

export async function proposeCandidates(options: GenerateOptions, ctx: PlanContext): Promise<Partial<Record<MealSlot, string[]>> | null> {
  if (!aiAvailable()) return null;
  const lib = ctx.recipes.map((r) => {
    const n = recipeNutrition(r).perServing;
    return `${r.id} | ${r.title} | ${r.cuisine} | slots:${r.slots.join("/")} | per serving ${Math.round(n.kcal)} kcal P${Math.round(n.protein)} C${Math.round(n.carbs)} F${Math.round(n.fat)} | ${r.prepMin + r.cookMin} min`;
  }).join("\n");
  const fb = ctx.feedback.map((f) => `${f.recipeId}: ${f.tags.join(",")}${f.favorite ? ",favorite" : ""}`).join("\n");
  const exp = ctx.inventory.filter((i) => i.expires).map((i) => `${i.name} (expires ${i.expires})`).join(", ");
  const schema = z.object({ slots: z.array(z.object({ slot: z.enum(["breakfast", "lunch", "dinner", "snack", "supplement"]), recipe_ids: z.array(z.string()) })) });
  const out = await parse(schema,
    "You shortlist recipes for a weekly meal plan. Only use recipe ids from the library. A separate optimiser sets portions and checks nutrition, so focus on fit, variety, preferences, cost, ingredient reuse and using expiring food.",
    `Targets: ${JSON.stringify(options.targets)}\nSlots: ${options.slots.join(", ")}\nPreferred cuisines: ${options.cuisines.join(", ") || "any"}\nMax time: ${options.maxPrepMin ?? "none"} min\nWeekly budget: ${options.weeklyBudget ?? "none"} ${ctx.profile.currency}\nRepeats OK: ${options.allowRepeats}\nDislikes/allergies: ${[...ctx.profile.dislikes, ...ctx.profile.allergies].join(", ") || "none"}\nFeedback:\n${fb || "none"}\nExpiring soon: ${exp || "nothing"}\n\nLibrary:\n${lib}\n\nReturn 4-8 good candidate ids per slot, best first.`,
    "low", 4000);
  const valid = new Set(ctx.recipes.map((r) => r.id));
  return Object.fromEntries(out.slots.map((s) => [s.slot, s.recipe_ids.filter((id) => valid.has(id))]));
}

// ------------------------------------------------------------------ ingredient mapping

export async function mapIngredientLines(lines: string[], servings: number): Promise<MappedLine[]> {
  const schema = z.object({
    items: z.array(z.object({
      line: z.string(),
      catalog_id: z.string().nullable().describe("id from the catalog if one clearly matches, else null"),
      usda_query: z.string().describe("short generic food name to search in the USDA database, e.g. 'chickpeas canned drained'"),
      grams: z.number().nullable().describe("raw edible grams for the whole recipe, converting cups/spoons/pieces with typical weights; null for 'to taste'"),
      confident: z.boolean(),
    })),
  });
  const out = await parse(schema,
    "Convert recipe ingredient lines into gram weights and match them to foods. Use typical USDA household weights for volume and count conversions. Be honest: mark confident=false when the conversion is a guess.",
    `Recipe makes ${servings} servings.\nCatalog (id: name):\n${catalogList()}\n\nLines:\n${lines.map((l, i) => `${i + 1}. ${l}`).join("\n")}`,
    "medium");
  return out.items.map((it) => {
    if (it.catalog_id && getIngredient(it.catalog_id)) {
      return { line: it.line, ingredientId: it.catalog_id, grams: it.grams, confidence: it.confident && it.grams ? "high" : "low", label: getIngredient(it.catalog_id)!.name };
    }
    const f = searchFoods(it.usda_query, 1)[0];
    return f
      ? { line: it.line, ingredientId: `ndb:${f.ndb}`, grams: it.grams, confidence: "low", label: prettyDescription(f.description) }
      : { line: it.line, ingredientId: null, grams: it.grams, confidence: "none" };
  });
}

// ------------------------------------------------------------------ online discovery

export interface DiscoveryHit { title: string; url: string; site: string; why: string }

export async function discoverRecipes(query: string): Promise<DiscoveryHit[]> {
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 6000,
    output_config: { effort: "low" },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4, allowed_domains: REPUTABLE_DOMAINS }],
    system: "Find real recipe pages that match the request. Only cite pages you actually found in search results. Reply with a JSON array only: [{\"title\",\"url\",\"site\",\"why\"}] with up to 6 items, where why is one short sentence on fit (protein, carbs, time).",
    messages: [{ role: "user", content: query }],
  });
  const textOut = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
  // Collect URLs that actually appeared in search results; drop anything else.
  const seen = new Set<string>();
  for (const b of res.content) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) if (r.type === "web_search_result") seen.add(r.url);
  }
  const m = textOut.match(/\[[\s\S]*\]/);
  if (!m) return [];
  let arr: DiscoveryHit[] = [];
  try { arr = JSON.parse(m[0]); } catch { return []; }
  return arr.filter((h) => h && typeof h.url === "string" && seen.has(h.url)).slice(0, 6);
}

// ------------------------------------------------------------------ recipe modification

export async function modifyRecipe(recipe: Recipe, instruction: string) {
  const schema = z.object({
    title: z.string(),
    summary: z.string().describe("one or two sentences describing what changed"),
    ingredients: z.array(z.object({ ingredient_id: z.string(), grams: z.number(), note: z.string().nullable(), group: z.string().nullable() })),
    steps: z.array(z.string()),
  });
  const current = recipe.ingredients.map((i) => `${i.ingredientId} ${i.grams} g${i.note ? ` (${i.note})` : ""}${i.group ? ` [${i.group}]` : ""}`).join("\n");
  const out = await parse(schema,
    "You adapt recipes to nutrition goals while keeping them delicious and cookable. Use only ingredient ids from the catalog or ids already in the recipe. Quantities are raw grams for the whole recipe. Don't state nutrition numbers; they're calculated separately.",
    `Catalog:\n${catalogList()}\n\nRecipe: ${recipe.title} (serves ${recipe.servings})\nIngredients:\n${current}\nSteps:\n${recipe.steps.map((s, i) => `${i + 1}. ${s.text}`).join("\n")}\n\nChange requested: ${instruction}`,
    "medium");
  const valid = out.ingredients.filter((i) => getIngredient(i.ingredient_id) && i.grams >= 0);
  return { title: out.title, summary: out.summary, ingredients: valid.map((i) => ({ ingredientId: i.ingredient_id, grams: i.grams, note: i.note ?? undefined, group: i.group ?? undefined })), steps: out.steps, dropped: out.ingredients.length - valid.length };
}

// ------------------------------------------------------------------ meal logging

const foodItems = z.object({
  name: z.string().describe("short name of the meal"),
  items: z.array(z.object({ name: z.string(), usda_query: z.string(), grams: z.number() })),
  notes: z.string().describe("assumptions you made, e.g. portion sizes or cooking oil"),
});

async function itemsToFoods(items: { name: string; usda_query: string; grams: number }[]) {
  return items.map((it) => {
    const matches = searchFoods(it.usda_query, 4);
    const f = matches[0];
    return {
      name: it.name, grams: Math.round(it.grams), ndb: f?.ndb, matched: f ? prettyDescription(f.description) : null,
      alternatives: matches.slice(1).map((m) => ({ ndb: m.ndb, name: prettyDescription(m.description) })),
    };
  });
}

export async function parseMealText(text: string) {
  const out = await parse(foodItems, "Break a described meal into individual foods with estimated gram weights. Include cooking oil and sauces when typical. Use generic USDA-style food names in usda_query.", text, "low");
  return { name: out.name, notes: out.notes, items: await itemsToFoods(out.items) };
}

export async function analyzeMealPhoto(base64: string, mediaType: "image/jpeg" | "image/png" | "image/webp", hint?: string) {
  const out = await parse(foodItems,
    "Identify the foods in this meal photo and estimate gram weights from visual cues (plate size, utensils). These are estimates; say what you assumed.",
    [{ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }, { type: "text", text: hint ? `Context: ${hint}` : "Estimate this meal." }],
    "medium");
  return { name: out.name, notes: out.notes, items: await itemsToFoods(out.items) };
}

export async function extractReceipt(base64: string, mediaType: "image/jpeg" | "image/png" | "image/webp") {
  const schema = z.object({
    store: z.string().nullable(),
    date: z.string().nullable().describe("YYYY-MM-DD if printed"),
    currency: z.string().nullable(),
    items: z.array(z.object({
      text: z.string().describe("the line as printed"),
      name: z.string().describe("plain food name"),
      catalog_id: z.string().nullable(),
      grams: z.number().nullable().describe("weight in grams if printed or clearly implied (e.g. 1 kg bag)"),
      price: z.number().nullable(),
      food: z.boolean().describe("false for non-food lines like bags or discounts"),
    })),
  });
  return parse(schema,
    "Read a grocery receipt. Only report what is printed; leave unknown fields null rather than guessing prices or weights.",
    [{ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }, { type: "text", text: `Match items to this catalog where clear:\n${catalogList()}` }],
    "medium");
}

// ------------------------------------------------------------------ assistant

export const ACTION_TYPES = ["replace_meal", "set_servings", "add_meal", "skip_meal", "log_food", "generate_week", "import_recipe", "rebalance_day"] as const;

const proposeTool: Anthropic.Tool = {
  name: "propose_changes",
  description: "Propose concrete changes the person can apply with one tap. Nothing is applied until they confirm. Call this once at the end when you have actionable suggestions.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["actions"],
    properties: {
      actions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "label", "reason", "date", "meal_id", "recipe_id", "servings", "slot", "foods", "url", "week_start", "cuisines", "weekly_budget", "max_prep_min"],
          properties: {
            type: { type: "string", enum: [...ACTION_TYPES] },
            label: { type: "string", description: "Short button text, e.g. 'Swap Thursday dinner for cod'" },
            reason: { type: "string" },
            date: { type: ["string", "null"], description: "YYYY-MM-DD" },
            meal_id: { type: ["string", "null"] },
            recipe_id: { type: ["string", "null"] },
            servings: { type: ["number", "null"] },
            slot: { type: ["string", "null"], enum: ["breakfast", "lunch", "dinner", "snack", "supplement", null] },
            foods: { type: ["array", "null"], items: { type: "object", additionalProperties: false, required: ["name", "usda_query", "grams"], properties: { name: { type: "string" }, usda_query: { type: "string" }, grams: { type: "number" } } } },
            url: { type: ["string", "null"] },
            week_start: { type: ["string", "null"] },
            cuisines: { type: ["array", "null"], items: { type: "string" } },
            weekly_budget: { type: ["number", "null"] },
            max_prep_min: { type: ["number", "null"] },
          },
        },
      },
    },
  },
};

export interface AssistantAction {
  type: (typeof ACTION_TYPES)[number];
  label: string;
  reason: string;
  date: string | null;
  meal_id: string | null;
  recipe_id: string | null;
  servings: number | null;
  slot: MealSlot | null;
  foods: { name: string; usda_query: string; grams: number }[] | null;
  url: string | null;
  week_start: string | null;
  cuisines: string[] | null;
  weekly_budget: number | null;
  max_prep_min: number | null;
}

export async function assistantTurn(history: Anthropic.MessageParam[], contextBlock: string) {
  const system = [
    {
      type: "text" as const,
      text: `You are the nutrition assistant inside Mise, a private meal-planning app. Be concise, warm and practical. Use the person's data below. Never invent nutrition numbers: quote figures from the context (calculated from USDA data) or say they will be calculated. For recipes from the internet use web search on reputable cooking sites and propose import_recipe with the exact URL you found. Propose changes with the propose_changes tool; never claim a change was made. You are not a medical professional; for medical questions suggest speaking to one. Today's context follows.`,
    },
    { type: "text" as const, text: contextBlock, cache_control: { type: "ephemeral" as const } },
  ];
  const tools: Anthropic.Messages.ToolUnion[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: 3, allowed_domains: REPUTABLE_DOMAINS },
    proposeTool,
  ];
  let messages = [...history];
  for (let i = 0; i < 4; i++) {
    const res = await client().messages.create({ model: MODEL, max_tokens: 8000, system, tools, output_config: { effort: "medium" }, messages });
    if (res.stop_reason === "refusal") return { text: "I can't help with that one.", actions: [] as AssistantAction[], sources: [] };
    const textOut = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    const sources: { url: string; title: string }[] = [];
    for (const b of res.content) if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) if (r.type === "web_search_result") sources.push({ url: r.url, title: r.title });
    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "propose_changes");
    if (res.stop_reason === "pause_turn") { messages = [...messages, { role: "assistant", content: res.content }]; continue; }
    const actions = ((call?.input as { actions?: AssistantAction[] })?.actions ?? []).filter((a) => ACTION_TYPES.includes(a.type));
    // Imports must point at a URL that actually came from search results.
    const allowed = new Set(sources.map((s) => s.url));
    return { text: textOut, actions: actions.filter((a) => a.type !== "import_recipe" || (a.url && (allowed.has(a.url) || REPUTABLE_DOMAINS.some((d) => a.url!.includes(d))))), sources };
  }
  return { text: "That took too long. Please try a simpler question.", actions: [] as AssistantAction[], sources: [] };
}

export function describeImported(src: ImportedRecipe) {
  return `${src.title} (${src.siteName})`;
}
