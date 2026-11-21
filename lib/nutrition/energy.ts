import type { Profile, Targets } from "@/lib/types";
import { macroEnergy, targetReference } from "./targets";

/** Physical activity multipliers commonly paired with Mifflin-St Jeor. */
export const ACTIVITY: Record<Profile["activity"], { factor: number; label: string; hint: string }> = {
  sedentary: { factor: 1.2, label: "Sedentary", hint: "Desk work, little exercise" },
  light: { factor: 1.375, label: "Lightly active", hint: "Light exercise 1–3 days a week" },
  moderate: { factor: 1.55, label: "Moderately active", hint: "Exercise 3–5 days a week" },
  active: { factor: 1.725, label: "Very active", hint: "Hard exercise 6–7 days a week" },
  "very-active": { factor: 1.9, label: "Extremely active", hint: "Physical job plus training" },
};

/** Mifflin-St Jeor resting energy (Mifflin et al., Am J Clin Nutr 1990;51:241-7). */
export function restingEnergy(p: Pick<Profile, "weightKg" | "heightCm" | "age" | "sex">) {
  if (!p.weightKg || !p.heightCm || !p.age) return null;
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  if (p.sex === "male") return { lo: base + 5, hi: base + 5 };
  if (p.sex === "female") return { lo: base - 161, hi: base - 161 };
  return { lo: base - 161, hi: base + 5 }; // sex not given: show the range of both equations
}

export function energyEstimate(p: Profile) {
  const rmr = restingEnergy(p);
  if (!rmr) return null;
  const f = ACTIVITY[p.activity].factor;
  return { rmr, tdee: { lo: rmr.lo * f, hi: rmr.hi * f } };
}

export interface TargetFlag {
  level: "caution" | "info";
  title: string;
  detail: string;
  source?: { label: string; url: string };
}

/**
 * Identify targets that may be inadequate. These are informational: nothing here blocks or
 * overrides the person's chosen targets, and none of it is medical advice.
 */
export function assessTargets(targets: Targets, p: Profile): TargetFlag[] {
  const flags: TargetFlag[] = [];
  const kcal = targetReference(targets.kcal);
  const protein = targetReference(targets.protein);
  const carbs = targetReference(targets.carbs);
  const fat = targetReference(targets.fat);
  const est = energyEstimate(p);
  const fromMacros = macroEnergy({ protein, carbs, fat });

  if (Math.abs(fromMacros - kcal) > Math.max(50, kcal * 0.06)) {
    flags.push({
      level: "info",
      title: "Calories and macros don't line up",
      detail: `Your macro targets add up to about ${Math.round(fromMacros)} kcal (4/4/9 kcal per gram), but the calorie target is ${Math.round(kcal)} kcal. Plans will aim for the macros and report the calorie gap.`,
    });
  }

  if (p.clinicianKcal) {
    flags.push({
      level: "info",
      title: `Clinician-provided target: ${p.clinicianKcal} kcal`,
      detail: kcal < p.clinicianKcal - 50
        ? `Your current target (${Math.round(kcal)} kcal) is below the intake your healthcare professional gave you. Consider aligning it.`
        : "Your target is consistent with the intake your healthcare professional gave you.",
    });
  }

  if (est) {
    const low = est.rmr.lo;
    if (kcal < low) {
      flags.push({
        level: "caution",
        title: "Below your estimated resting energy",
        detail: `${Math.round(kcal)} kcal is under your estimated resting energy expenditure of ${Math.round(est.rmr.lo)}${est.rmr.hi !== est.rmr.lo ? `–${Math.round(est.rmr.hi)}` : ""} kcal (Mifflin-St Jeor), before any activity. Estimated total daily expenditure is about ${Math.round(est.tdee.lo)}${est.tdee.hi !== est.tdee.lo ? `–${Math.round(est.tdee.hi)}` : ""} kcal.`,
      });
    }
  }
  if (kcal < 1200 && !p.clinicianKcal) {
    flags.push({
      level: "caution",
      title: "Very low calorie target",
      detail: `${Math.round(kcal)} kcal/day is below the 1,000–1,200 (women) and 1,200–1,600 (men) kcal/day ranges that U.S. NIH clinical guidelines describe for weight-loss diets. Intakes this low are generally followed with medical supervision. The app will plan to it if you keep it, but won't push you lower.`,
      source: { label: "NHLBI Clinical Guidelines on Overweight and Obesity (1998)", url: "https://www.ncbi.nlm.nih.gov/books/NBK2003/" },
    });
  }
  if (kcal > 0 && (fat * 9) / kcal < 0.2) {
    flags.push({
      level: "caution",
      title: "Fat is below the recommended range",
      detail: `${Math.round(fat)} g fat is about ${Math.round(((fat * 9) / kcal) * 100)}% of energy. The Acceptable Macronutrient Distribution Range for adults is 20–35%. Very low fat can make it hard to get essential fatty acids and absorb fat-soluble vitamins.`,
      source: { label: "Institute of Medicine, Dietary Reference Intakes (2005)", url: "https://nap.nationalacademies.org/catalog/10490" },
    });
  }
  if (carbs < 130) {
    flags.push({
      level: "info",
      title: "Carbohydrate below the RDA",
      detail: `${Math.round(carbs)} g is under the 130 g/day RDA for adults. Low-carbohydrate eating is a legitimate choice; plans will favour fibre-rich vegetables to keep fibre up.`,
      source: { label: "Institute of Medicine, Dietary Reference Intakes (2005)", url: "https://nap.nationalacademies.org/catalog/10490" },
    });
  }
  if (p.weightKg) {
    const gkg = protein / p.weightKg;
    if (gkg > 2.5) {
      flags.push({
        level: "info",
        title: "High protein relative to body weight",
        detail: `${Math.round(protein)} g is ${gkg.toFixed(1)} g per kg. Most sports-nutrition guidance tops out around 2.0–2.2 g/kg; more is not harmful for most healthy people but adds little.`,
      });
    }
  }
  return flags;
}
