import Link from "next/link";
import { Plus, CalendarDays, ChefHat, ShoppingBasket, AlertCircle } from "lucide-react";
import { allRecipes, getGrocery, getInventory, getLogs, getPrep, getPrices, getProfile, getTargets, getWater, getWeek, TIMEZONE } from "@/lib/store";
import { dayTotals } from "@/lib/services/planner";
import { logTotals } from "@/lib/services/analytics";
import { buildGrocery } from "@/lib/services/grocery";
import { buildPrepSchedule } from "@/lib/services/prep";
import { add, compliance, fmt, targetBounds, zero } from "@/lib/nutrition/compute";
import { addDays, daysBetween, formatDay, mondayOf, money, todayISO, SLOT_LABEL, cn } from "@/lib/util";
import { summaryMap } from "@/lib/view";
import { MealCard } from "@/components/meal-card";
import { MacroBar, Notice, PageHeader, Ring, Section, Empty, TextLink } from "@/components/ui";
import { WaterTracker } from "./water";
import { LogList } from "./log-list";
import { ProposalCard } from "./proposal-card";

export const metadata = { title: "Overview" };

export default async function Overview() {
  const today = todayISO(TIMEZONE);
  const monday = mondayOf(today);
  const [recipes, targets, profile, week, logs, water, inventory, prices, grocery, prep] = await Promise.all([
    allRecipes(), getTargets(), getProfile(), getWeek(monday), getLogs(), getWater(), getInventory(), getPrices(), getGrocery(monday), getPrep(monday),
  ]);
  const nextMonday = addDays(monday, 7);
  const nextWeekPlan = profile.weeklyProposal ? await getWeek(nextMonday) : null;
  const showProposal = profile.weeklyProposal && (nextWeekPlan?.status === "proposed" || (!nextWeekPlan && daysBetween(today, nextMonday) <= 4));
  const summaries = summaryMap(recipes);
  const day = week?.days.find((d) => d.date === today);
  const todaysLogs = logs.filter((l) => l.date === today);
  const planned = day ? dayTotals(day, recipes, "planned") : zero();
  let eaten = day ? dayTotals(day, recipes, "actual") : zero();
  let plannedPlusLogs = planned;
  for (const l of todaysLogs) { const t = logTotals(l); eaten = add(eaten, t); plannedPlusLogs = add(plannedPlusLogs, t); }
  const kcalB = targetBounds(targets.kcal);
  const kcalRef = targets.kcal.mode === "range" ? kcalB.hi : targets.kcal.value;
  const remaining = { kcal: kcalRef - eaten.kcal, protein: (targets.protein.mode === "range" ? targets.protein.max ?? 0 : targets.protein.value) - eaten.protein, carbs: targetBounds(targets.carbs).hi - eaten.carbs, fat: targetBounds(targets.fat).hi - eaten.fat };
  const waterToday = water.find((w) => w.date === today)?.ml ?? 0;

  // Week overview
  const weekDays = week?.days ?? [];
  const groceryView = buildGrocery(week, recipes, inventory, prices, grocery, profile.currency, today);
  const toBuy = groceryView.lines.filter((l) => l.toBuy > 0 && !l.checked && !l.staple);
  const { sessions } = buildPrepSchedule(week, recipes, prep);
  const upcoming = sessions.filter((s) => !prep.confirmed[s.key] && s.date >= addDays(today, -1));
  const preparedCount = weekDays.reduce((n, d) => n + d.meals.filter((m) => m.status === "prepared" || (m.status === "eaten")).length, 0);
  const totalMeals = weekDays.reduce((n, d) => n + d.meals.filter((m) => m.status !== "skipped").length, 0);
  const expiring = inventory.filter((i) => i.expires && daysBetween(today, i.expires) <= 3 && i.grams > 0).sort((a, b) => a.expires!.localeCompare(b.expires!));
  const weekCost = (() => {
    const all = buildGrocery(week, recipes, [], prices, { weekId: monday, checked: {}, adjustments: {}, removed: {}, substitutions: {}, manual: [] }, profile.currency);
    return all;
  })();

  const eatenCount = day?.meals.filter((m) => m.status === "eaten").length ?? 0;
  const mealCount = day?.meals.filter((m) => m.status !== "skipped").length ?? 0;

  return (
    <div className="rise">
      <PageHeader eyebrow={formatDay(today, { weekday: "long" })} title={formatDay(today, { day: "numeric", month: "long" })}
        sub={day ? `${mealCount} meals planned · ${eatenCount} eaten${upcoming[0] ? ` · next prep ${upcoming[0].date === today ? "today" : formatDay(upcoming[0].date, { weekday: "long" })}` : ""}` : "No plan for today yet."}>
        <Link href={`/log?date=${today}`} className="btn btn-secondary"><Plus size={15} />Record food</Link>
        <Link href="/plan" className="btn btn-primary"><CalendarDays size={15} />Weekly plan</Link>
      </PageHeader>

      {/* Today's nutrition */}
      <Section>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center lg:items-start xl:items-center">
            <Ring value={eaten.kcal} max={kcalRef || 1} planned={plannedPlusLogs.kcal} size={188} stroke={11}>
              <div>
                <p className="tnum text-[40px] font-medium leading-none tracking-tight">{fmt(eaten.kcal)}</p>
                <p className="mt-1 text-[12px] text-muted">of {fmt(kcalRef)} kcal eaten</p>
                <p className="mt-0.5 text-[11px] text-faint">{fmt(plannedPlusLogs.kcal)} planned</p>
              </div>
            </Ring>
            <dl className="grid w-full max-w-xs grid-cols-2 gap-x-6 gap-y-4 text-[12.5px]">
              <div><dt className="eyebrow">Remaining</dt><dd className="tnum mt-1 text-[20px] font-medium">{fmt(Math.max(0, remaining.kcal))}<span className="ml-1 text-xs font-normal text-muted">kcal</span></dd></div>
              <div><dt className="eyebrow">Protein left</dt><dd className="tnum mt-1 text-[20px] font-medium">{fmt(Math.max(0, remaining.protein))}<span className="ml-1 text-xs font-normal text-muted">g</span></dd></div>
              <div><dt className="eyebrow">Fibre</dt><dd className="tnum mt-1 text-[20px] font-medium">{fmt(eaten.fiber)}<span className="ml-1 text-xs font-normal text-muted">/ {fmt(plannedPlusLogs.fiber)} g</span></dd></div>
              <div><dt className="eyebrow">Fat allowance</dt><dd className={cn("tnum mt-1 text-[20px] font-medium", remaining.fat < 0 && "text-clay")}>{fmt(remaining.fat)}<span className="ml-1 text-xs font-normal text-muted">g</span></dd></div>
            </dl>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-[11px] text-muted">
              <span className="flex items-center gap-1.5"><span className="inline-block h-1.5 w-4 rounded-full bg-forest" />Eaten</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-1.5 w-4 rounded-full opacity-40" style={{ background: "repeating-linear-gradient(135deg,#1e3a2a 0 3px,transparent 3px 6px)" }} />Planned</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-1.5 w-4 rounded-full bg-ink/10" />Target band</span>
            </div>
            <MacroBar label="Protein" unit="g" keyName="protein" eaten={eaten.protein} planned={plannedPlusLogs.protein} target={targets.protein} />
            <MacroBar label="Carbohydrate" unit="g" keyName="carbs" eaten={eaten.carbs} planned={plannedPlusLogs.carbs} target={targets.carbs} />
            <MacroBar label="Fat" unit="g" keyName="fat" eaten={eaten.fat} planned={plannedPlusLogs.fat} target={targets.fat} />
            {profile.hydration && <WaterTracker date={today} ml={waterToday} target={profile.waterTargetMl} />}
          </div>
        </div>
      </Section>

      {/* Today's meals */}
      <Section title="Today's meals" action={<Link href={`/log?date=${today}&tab=recipe`} className="btn btn-ghost btn-sm"><Plus size={14} />Add another meal</Link>} className="border-t hairline">
        {!day || day.meals.length === 0 ? (
          <Empty title="Nothing planned today" action={<Link href="/plan?generate=1" className="btn btn-primary">Generate my week</Link>}>Generate a week or add a meal from the recipe library.</Empty>
        ) : (
          <div className="divide-y divide-line">
            {day.meals.map((m) => (
              <div key={m.id} className="py-4 first:pt-0 last:pb-0"><MealCard meal={m} recipe={summaries[m.recipeId]} weekId={monday} date={today} /></div>
            ))}
          </div>
        )}
        {todaysLogs.length > 0 && <div className="mt-6"><p className="eyebrow mb-2">Recorded outside the plan</p><LogList entries={todaysLogs.map((l) => ({ ...l, t: logTotals(l) }))} /></div>}
      </Section>

      {/* Week overview */}
      <Section title="This week" action={<TextLink href="/analytics">Analytics</TextLink>} className="border-t hairline">
        {!week ? (
          <Empty title="No plan for this week" action={<Link href="/plan?generate=1" className="btn btn-primary">Generate my week</Link>} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="panel overflow-hidden">
              <div className="grid grid-cols-[72px_repeat(7,1fr)] border-b hairline text-center text-[10.5px] uppercase tracking-wider text-muted">
                <span />
                {weekDays.map((d) => <Link key={d.date} href={`/plan?week=${monday}&day=${d.date}`} className={cn("py-2", d.date === today && "font-semibold text-forest")}>{formatDay(d.date, { weekday: "narrow" })}<span className="block text-[10px] normal-case tracking-normal">{formatDay(d.date, { day: "numeric" })}</span></Link>)}
              </div>
              {(["protein", "carbs", "fat", "kcal"] as const).map((k) => (
                <div key={k} className="grid grid-cols-[72px_repeat(7,1fr)] items-center border-b hairline last:border-0">
                  <span className="px-3 py-2.5 text-[11.5px] text-ink-2">{{ protein: "Protein", carbs: "Carbs", fat: "Fat", kcal: "Energy" }[k]}</span>
                  {weekDays.map((d) => {
                    const past = d.date < today;
                    const totals = dayTotals(d, recipes, past ? "actual" : "planned");
                    const dayLogs = logs.filter((l) => l.date === d.date);
                    let v = totals[k];
                    for (const l of dayLogs) v += logTotals(l)[k];
                    const st = compliance(v, targets[k]);
                    return (
                      <span key={d.date} className="grid place-items-center py-2.5" title={`${fmt(v)} ${k === "kcal" ? "kcal" : "g"} ${past ? "eaten" : "planned"}`}>
                        <span className={cn("size-2.5 rounded-full", st === "met" ? "bg-forest" : st === "over" ? "bg-clay" : "bg-sand", !past && "opacity-45")} />
                      </span>
                    );
                  })}
                </div>
              ))}
              <p className="px-3 py-2 text-[11px] text-muted">Solid dots are actual intake, faded dots are the plan. Green within target, sand under, clay over.</p>
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border hairline bg-line">
              <Link href="/prep" className="bg-card p-4 hover:bg-paper">
                <p className="eyebrow flex items-center gap-1.5"><ChefHat size={12} />Meals prepared</p>
                <p className="tnum mt-2 text-[24px] font-medium">{preparedCount}<span className="text-sm font-normal text-muted"> / {totalMeals}</span></p>
                <p className="mt-1 text-[11.5px] text-muted">{upcoming[0] ? `Next session ${formatDay(upcoming[0].date, { weekday: "short", day: "numeric", month: "short" })}, ${upcoming[0].meals.length} meals` : "No sessions outstanding"}</p>
              </Link>
              <Link href="/grocery" className="bg-card p-4 hover:bg-paper">
                <p className="eyebrow flex items-center gap-1.5"><ShoppingBasket size={12} />To buy</p>
                <p className="tnum mt-2 text-[24px] font-medium">{toBuy.length}<span className="text-sm font-normal text-muted"> items</span></p>
                <p className="mt-1 text-[11.5px] text-muted">{groceryView.total > 0 ? `≈ ${money(groceryView.total, profile.currency)} remaining` : "Add prices to estimate cost"}</p>
              </Link>
              <div className="bg-card p-4">
                <p className="eyebrow">Week's food cost</p>
                <p className="tnum mt-2 text-[24px] font-medium">{weekCost.total > 0 ? money(weekCost.total, profile.currency) : "—"}</p>
                <p className="mt-1 text-[11.5px] text-muted">{weekCost.kinds.has("demo") ? "Demo price estimates" : weekCost.kinds.size ? "From your prices" : "No prices yet"}{weekCost.unpriced ? ` · ${weekCost.unpriced} unpriced` : ""}</p>
              </div>
              <Link href="/inventory" className="bg-card p-4 hover:bg-paper">
                <p className="eyebrow flex items-center gap-1.5"><AlertCircle size={12} />Use soon</p>
                {expiring.length ? (
                  <ul className="mt-2 space-y-0.5 text-[12.5px]">
                    {expiring.slice(0, 3).map((i) => <li key={i.id} className="flex justify-between gap-2"><span className="truncate">{i.name}</span><span className={cn("tnum shrink-0", daysBetween(today, i.expires!) < 0 ? "text-clay" : "text-muted")}>{daysBetween(today, i.expires!) < 0 ? "expired" : daysBetween(today, i.expires!) === 0 ? "today" : `${daysBetween(today, i.expires!)}d`}</span></li>)}
                  </ul>
                ) : <p className="mt-2 text-[12.5px] text-muted">Nothing expiring in the next 3 days.</p>}
              </Link>
            </div>
          </div>
        )}
        {showProposal && <div className="mt-4"><ProposalCard nextWeek={nextMonday} status={nextWeekPlan ? "proposed" : "none"} label={`the week of ${formatDay(nextMonday, { day: "numeric", month: "short" })}`} /></div>}
        {week?.status === "proposed" && <Notice tone="info" className="mt-4" title="A proposed plan is waiting for you">Review it in the <Link href={`/plan?week=${week.id}`} className="underline">planner</Link> and confirm it before shopping.</Notice>}
      </Section>
      <span className="sr-only">{Object.keys(SLOT_LABEL).length}</span>
    </div>
  );
}
