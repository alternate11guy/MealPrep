import { allRecipes, getFeedback } from "@/lib/store";
import { getIngredient } from "@/lib/nutrition/ingredients";
import { summarize } from "@/lib/view";
import { LibraryClient, type LibraryItem } from "./library-client";

export const metadata = { title: "Recipe library" };

export default async function RecipesPage() {
  const [recipes, feedback] = await Promise.all([allRecipes(), getFeedback()]);
  const fb = new Map(feedback.map((f) => [f.recipeId, f]));
  const items: LibraryItem[] = recipes.map((r) => {
    const f = fb.get(r.id);
    return {
      ...summarize(r),
      description: r.description,
      categories: r.categories,
      slots: r.slots,
      proteins: [...new Set(r.ingredients.map((i) => getIngredient(i.ingredientId)?.protein).filter((p): p is NonNullable<typeof p> => Boolean(p)))],
      ingredientNames: r.ingredients.map((i) => getIngredient(i.ingredientId)?.name ?? "").filter(Boolean),
      sourceKind: r.source.kind,
      sourceName: r.source.name,
      mealPrep: r.mealPrep,
      favorite: Boolean(f?.favorite),
      rating: f?.rating,
      hidden: Boolean(f?.tags.includes("never")),
    };
  });
  return <LibraryClient items={items} />;
}
