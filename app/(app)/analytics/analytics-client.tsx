"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart } from "recharts";
import { Heart, Star } from "lucide-react";
import { Notice, PageHeader, Section, Stat } from "@/components/ui";
import { toast, useErrorToast } from "@/components/dialog";
import { addWeightAction } from "@/app/actions/data";
import { fmt } from "@/lib/nutrition/targets";
import { cn, formatDay, money } from "@/lib/util";
import type { Targets } from "@/lib/types";

// Chart palette validated for CVD separation and contrast on the card surface (#fffdf8).
// Identity is never colour-only: every chart has a legend and the table view below.
const C = { protein: "#1f8452", carbs: "#b8821c", fat: "#3a6fb5", energy: "#1f8452", planned: "#6e6d61", band: "rgba(31,33,28,0.06)", grid: "#ebe5d7", axis: "#6e6d61" };
type MacroKey = "kcal" | "protein" | "carbs" | "fat";
type Day = { date: string; planned: Record<MacroKey, number>; actual: Record<MacroKey, number>; tracked: boolean; plannedMeals: number; eatenMeals: number };
type Rate = { met: number; of: number } | null;

const tickDate = (d: string, n: number) => formatDay(d, n > 14 ? { day: "numeric", month: "short" } : { weekday: "short", day: "numeric" });

function TipBox({ active, payload, label, unit }: { active?: boolean; payload?: { name: string; value: number | null; color: string; dataKey: string }[]; label?: string; unit: string }) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-[6px] border hairline bg-card px-3 py-2 text-[12px] shadow-md">
      <p className="mb-1 font-medium text-ink">{formatDay(label, { weekday: "long", day: "numeric", month: "short" })}</p>
      {payload.filter((p) => p.value != null).map((p) => (
        <p key={p.dataKey} className="tnum flex items-center gap-2 text-ink-2"><span className="inline-block size-2 rounded-full" style={{ background: p.color }} />{p.name}: <b className="font-medium text-ink">{fmt(p.value!)} {unit}</b></p>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string; dashed?: boolean; band?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          {i.band ? <span className="inline-block h-2.5 w-4 rounded-[2px]" style={{ background: "rgba(31,33,28,0.12)" }} /> : i.dashed ? <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: i.color }} /> : <span className="inline-block size-2.5 rounded-[2px]" style={{ background: i.color }} />}
          {i.label}
        </span>
      ))}
    </div>
  );
}

function DailyChart({ data, k, color, unit, bound, height = 220 }: { data: Day[]; k: MacroKey; color: string; unit: string; bound: { lo: number; hi: number }; height?: number }) {
  const rows = data.map((d) => ({ date: d.date, actual: d.tracked ? Math.round(d.actual[k]) : null, planned: d.plannedMeals ? Math.round(d.planned[k]) : null }));
  const hi = Number.isFinite(bound.hi) ? bound.hi : bound.lo * 1.3;
  const raw = Math.max(hi * 1.15, ...rows.map((r) => Math.max(r.actual ?? 0, r.planned ?? 0)));
  const step = raw > 600 ? 200 : raw > 150 ? 50 : raw > 60 ? 20 : 10;
  const max = Math.ceil(raw / step) * step;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap={data.length > 40 ? 1 : "22%"}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <ReferenceArea y1={bound.lo} y2={Number.isFinite(bound.hi) ? bound.hi : max} fill={C.band} ifOverflow="extendDomain" />
        <XAxis dataKey="date" tickFormatter={(d) => tickDate(d, data.length)} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={{ stroke: C.grid }} minTickGap={16} />
        <YAxis domain={[0, max]} ticks={Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step).filter((_, i, a) => a.length <= 6 || i % Math.ceil(a.length / 5) === 0)} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} width={44} />
        <Tooltip content={<TipBox unit={unit} />} cursor={{ fill: "rgba(31,33,28,0.04)" }} />
        <Bar dataKey="actual" name="Eaten" fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Line dataKey="planned" name="Planned" stroke={C.planned} strokeWidth={2} strokeDasharray="4 3" dot={data.length <= 14 ? { r: 3, fill: C.planned, stroke: "#fffdf8", strokeWidth: 2 } : false} connectNulls={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const pct = (r: Rate) => (r && r.of ? Math.round((r.met / r.of) * 100) : null);

export function AnalyticsClient(props: {
  range: string; from: string; to: string; today: string; daily: Day[]; targets: Targets; bounds: Record<string, { lo: number; hi: number }>;
  compliance: Record<string, { actual: Rate; planned: Rate }>;
  avgActual: ({ days: number } & Record<MacroKey, number>) | null; avgPlanned: ({ days: number } & Record<MacroKey, number>) | null;
  adherence: { planned: number; eaten: number; skipped: number };
  topMeals: { id: string; title: string; eaten: number; skipped: number; rating?: number; favorite: boolean }[]; mostSkipped: { id: string; title: string; skipped: number }[];
  spend: { weeks: { week: string; estimate: number; coverage: number }[]; purchases: number; currency: string; priceKinds: string[]; wasteCount: number; wasteGrams: number; wasteCost: number };
  weights: { date: string; kg: number; demo: boolean }[]; weightContext: { first: { date: string; kg: number } | null; last: { date: string; kg: number } | null; target: number | null };
  currentWeek: string; demo: boolean;
}) {
  const router = useRouter();
  const onError = useErrorToast();
  const [pending, start] = useTransition();
  const [from, setFrom] = useState(props.from);
  const [to, setTo] = useState(props.to);
  const [kg, setKg] = useState("");
  const { daily, bounds, spend } = props;
  const tracked = daily.filter((d) => d.tracked).length;
  const adherencePct = props.adherence.planned ? Math.round((props.adherence.eaten / props.adherence.planned) * 100) : null;
  const wc = props.weightContext;
  const change = wc.first && wc.last && wc.first.date !== wc.last.date ? wc.last.kg - wc.first.kg : null;

  const ranges = [{ id: "7", label: "7 days" }, { id: "30", label: "30 days" }, { id: "90", label: "90 days" }];
  const saveWeight = () => start(async () => {
    try { await addWeightAction(props.today, Number(kg)); setKg(""); toast("Weight recorded"); } catch (e) { onError(e); }
  });

  return (
    <div className="rise pb-16">
      <PageHeader eyebrow="Nutrition analytics" title="How it's going" sub={`${formatDay(props.from, { day: "numeric", month: "short" })} – ${formatDay(props.to, { day: "numeric", month: "short", year: "numeric" })} · ${tracked} of ${daily.length} days with food recorded. Days with nothing recorded are left out of averages, not counted as zero.`} />

      {/* Filters: one row above all charts */}
      <div className="no-print sticky top-0 z-20 flex flex-wrap items-center gap-1.5 border-b hairline bg-ivory/95 px-4 py-3 backdrop-blur sm:px-8">
        {ranges.map((r) => <Link key={r.id} href={`/analytics?range=${r.id}`} className={cn("chip", props.range === r.id && "chip-on")}>{r.label}</Link>)}
        <span className="mx-1 h-5 w-px bg-line" />
        <input type="date" className="field h-8 !w-auto py-0 text-[12.5px]" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <span className="text-[12px] text-muted">to</span>
        <input type="date" className="field h-8 !w-auto py-0 text-[12.5px]" value={to} min={from} max={props.today} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        <button className={cn("chip", props.range === "custom" && "chip-on")} onClick={() => router.push(`/analytics?range=custom&from=${from}&to=${to}`)}>Apply range</button>
      </div>

      {props.demo && <div className="px-4 pt-4 sm:px-8"><Notice tone="demo">Charts include demonstration history (simulated eating and weights). Clear it in Settings to see only your own data.</Notice></div>}

      <section className="grid grid-cols-2 gap-3 px-4 pt-6 sm:px-8 lg:grid-cols-4">
        <Stat label="Average energy eaten" value={props.avgActual ? fmt(props.avgActual.kcal) : "–"} unit="kcal" sub={props.avgPlanned ? `${fmt(props.avgPlanned.kcal)} planned · target ${fmt(props.targets.kcal.value)}` : undefined} />
        <Stat label="Average protein eaten" value={props.avgActual ? fmt(props.avgActual.protein) : "–"} unit="g" sub={`target ${fmt(props.targets.protein.value)} g`} />
        <Stat label="Days on energy target" value={pct(props.compliance.kcal.actual) != null ? `${pct(props.compliance.kcal.actual)}%` : "–"} sub={props.compliance.kcal.actual ? `${props.compliance.kcal.actual.met} of ${props.compliance.kcal.actual.of} recorded days · protein ${pct(props.compliance.protein.actual)}%` : "No recorded days"} />
        <Stat label="Planned meals eaten" value={adherencePct != null ? `${adherencePct}%` : "–"} sub={`${props.adherence.eaten} eaten · ${props.adherence.skipped} skipped of ${props.adherence.planned}`} />
      </section>

      <Section title="Energy" action={<Legend items={[{ label: "Eaten", color: C.energy }, { label: "Planned", color: C.planned, dashed: true }, { label: "Target range", color: "", band: true }]} />}>
        <div className="panel px-2 pb-2 pt-4"><DailyChart data={daily} k="kcal" color={C.energy} unit="kcal" bound={bounds.kcal} height={260} /></div>
      </Section>

      <Section title="Macronutrients" action={<Legend items={[{ label: "Eaten", color: C.protein }, { label: "Planned", color: C.planned, dashed: true }, { label: "Target range", color: "", band: true }]} />} className="pt-0">
        <div className="grid gap-3 lg:grid-cols-3">
          {([["protein", "Protein", C.protein], ["carbs", "Carbohydrate", C.carbs], ["fat", "Fat", C.fat]] as const).map(([k, label, color]) => (
            <div key={k} className="panel px-2 pb-2 pt-3">
              <div className="flex items-baseline justify-between px-2">
                <p className="flex items-center gap-2 text-[13px] font-medium"><span className="inline-block size-2.5 rounded-[2px]" style={{ background: color }} />{label}</p>
                <p className="tnum text-[11.5px] text-muted">avg {props.avgActual ? fmt(props.avgActual[k]) : "–"} g · on target {pct(props.compliance[k].actual) ?? "–"}{pct(props.compliance[k].actual) != null && "%"}</p>
              </div>
              <DailyChart data={daily} k={k} color={color} unit="g" bound={bounds[k]} height={180} />
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11.5px] text-muted">Each macro has its own chart and scale. Planned values come from the plan as generated; eaten values from meals marked eaten plus anything recorded.</p>
      </Section>

      <div className="grid gap-0 lg:grid-cols-2">
        <Section title="Weight" className="pt-0">
          <div className="panel px-2 pb-2 pt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-2">
              <p className="tnum text-[12.5px] text-ink-2">{wc.last ? <>Latest <b className="font-medium text-ink">{fmt(wc.last.kg, 1)} kg</b> ({formatDay(wc.last.date)})</> : "No weights yet"}{change != null && <span className="text-muted"> · {change > 0 ? "+" : ""}{fmt(change, 1)} kg since {formatDay(wc.first!.date)}</span>}</p>
              <div className="no-print flex items-center gap-1.5">
                <input type="number" step="0.1" min={30} max={300} className="field tnum h-8 !w-24 py-0 text-[12.5px]" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="kg today" aria-label="Today's weight in kg" />
                <button className="btn btn-secondary btn-sm" disabled={pending || !kg} onClick={saveWeight}>Record</button>
              </div>
            </div>
            {props.weights.length >= 2 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={props.weights} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
                  <CartesianGrid vertical={false} stroke={C.grid} />
                  <XAxis dataKey="date" tickFormatter={(d) => tickDate(d, 30)} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={{ stroke: C.grid }} minTickGap={20} />
                  <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => fmt(v, 0)} />
                  {wc.target && <ReferenceLine y={wc.target} stroke={C.planned} strokeDasharray="4 3" label={{ value: `Goal ${wc.target} kg`, position: "insideTopRight", fontSize: 11, fill: C.axis }} ifOverflow="extendDomain" />}
                  <Tooltip content={<TipBox unit="kg" />} />
                  <Line isAnimationActive={false} dataKey="kg" name="Weight" stroke={C.protein} strokeWidth={2} dot={props.weights.length <= 20 ? { r: 4, fill: C.protein, stroke: "#fffdf8", strokeWidth: 2 } : false} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="px-2 py-10 text-center text-[13px] text-muted">Record your weight a few times to see a trend. Daily weight swings of 1–2 kg are normal; the trend over weeks is what matters.</p>}
          </div>
        </Section>

        <Section title="Spending" className="pt-0">
          <div className="panel px-2 pb-2 pt-3">
            <div className="grid grid-cols-3 gap-2 px-2 text-[12px]">
              <div><p className="text-muted">Recorded purchases</p><p className="display tnum text-[20px]">{spend.purchases ? money(spend.purchases, spend.currency) : "–"}</p></div>
              <div><p className="text-muted">Discarded</p><p className="display tnum text-[20px]">{spend.wasteCount}</p><p className="tnum text-[11px] text-muted">{spend.wasteGrams ? `${fmt(spend.wasteGrams / 1000, 1)} kg` : ""}{spend.wasteCost ? ` · ${money(spend.wasteCost, spend.currency)}` : ""}</p></div>
              <div><p className="text-muted">Price basis</p><p className="text-[12px] leading-snug">{spend.priceKinds.length ? spend.priceKinds.map((k) => ({ manual: "your prices", demo: "demo prices", estimate: "estimates", verified: "verified" }[k] ?? k)).join(", ") : "no prices"}</p></div>
            </div>
            {spend.weeks.length > 0 ? (
              <>
                <p className="mt-3 px-2 text-[12px] text-muted">Estimated plan cost per week ({spend.currency})</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={spend.weeks} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
                    <CartesianGrid vertical={false} stroke={C.grid} />
                    <XAxis dataKey="week" tickFormatter={(d) => formatDay(d, { day: "numeric", month: "short" })} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={{ stroke: C.grid }} />
                    <YAxis tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} width={50} />
                    <Tooltip cursor={{ fill: "rgba(31,33,28,0.04)" }} content={({ active, payload }) => active && payload?.length ? <div className="rounded-[6px] border hairline bg-card px-3 py-2 text-[12px] shadow-md"><p className="font-medium">Week of {formatDay(String(payload[0].payload.week), { day: "numeric", month: "short" })}</p><p className="tnum text-ink-2">{money(Number(payload[0].value), spend.currency)} · {Math.round(payload[0].payload.coverage * 100)}% of items priced</p></div> : null} />
                    <Bar dataKey="estimate" name="Estimated cost" fill={C.carbs} radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </>
            ) : <p className="px-2 py-8 text-center text-[13px] text-muted">No plans in this range.</p>}
          </div>
        </Section>
      </div>

      <div className="grid gap-0 lg:grid-cols-2">
        <Section title="Most eaten" className="pt-0">
          {props.topMeals.length ? (
            <ul className="divide-y divide-line rounded-[8px] border hairline bg-card">
              {props.topMeals.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
                  <Link href={`/recipes/${m.id}`} className="min-w-0 flex-1 truncate hover:text-forest">{m.title}</Link>
                  {m.favorite && <Heart size={13} className="text-clay" fill="currentColor" aria-label="Favourite" />}
                  {m.rating ? <span className="flex items-center gap-0.5 text-[12px] text-muted"><Star size={12} className="text-amber" fill="currentColor" />{m.rating}</span> : null}
                  <span className="tnum w-20 text-right text-[12px] text-ink-2">{m.eaten}× eaten</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-muted">Mark planned meals as eaten to see what you enjoy most.</p>}
        </Section>
        <Section title="Often skipped" className="pt-0">
          {props.mostSkipped.length ? (
            <>
              <ul className="divide-y divide-line rounded-[8px] border hairline bg-card">{props.mostSkipped.map((m) => <li key={m.id} className="flex items-center justify-between px-3.5 py-2.5 text-[13px]"><Link href={`/recipes/${m.id}`} className="hover:text-forest">{m.title}</Link><span className="tnum text-[12px] text-ink-2">{m.skipped}× skipped</span></li>)}</ul>
              <p className="mt-2 text-[11.5px] text-muted">Rate these on their recipe page (for example &quot;Didn&apos;t enjoy&quot;) and the planner will suggest them less.</p>
            </>
          ) : <p className="text-[13px] text-muted">Nothing skipped in this range.</p>}
        </Section>
      </div>

      <Section className="pt-0">
        <details className="panel px-4 py-3">
          <summary className="cursor-pointer text-[13px]">Table view of daily values</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="tnum w-full min-w-[560px] text-[12.5px]">
              <thead className="text-left text-muted"><tr><th className="py-1.5 font-normal">Day</th><th className="font-normal">Energy eaten / planned</th><th className="font-normal">Protein</th><th className="font-normal">Carbs</th><th className="font-normal">Fat</th><th className="font-normal">Meals eaten</th></tr></thead>
              <tbody className="divide-y divide-line">
                {daily.map((d) => (
                  <tr key={d.date}>
                    <td className="py-1.5">{formatDay(d.date)}</td>
                    <td>{d.tracked ? fmt(d.actual.kcal) : "–"} / {d.plannedMeals ? fmt(d.planned.kcal) : "–"}</td>
                    <td>{d.tracked ? fmt(d.actual.protein) : "–"} / {d.plannedMeals ? fmt(d.planned.protein) : "–"} g</td>
                    <td>{d.tracked ? fmt(d.actual.carbs) : "–"} / {d.plannedMeals ? fmt(d.planned.carbs) : "–"} g</td>
                    <td>{d.tracked ? fmt(d.actual.fat) : "–"} / {d.plannedMeals ? fmt(d.planned.fat) : "–"} g</td>
                    <td>{d.eatenMeals} of {d.plannedMeals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Section>
    </div>
  );
}
