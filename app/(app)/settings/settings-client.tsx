"use client";

import { useMemo, useState, useTransition } from "react";
import { Download, LogOut } from "lucide-react";
import { Notice, PageHeader, Section } from "@/components/ui";
import { TargetEditor } from "@/components/target-editor";
import { EnergySummary, TargetFlags } from "@/components/target-flags";
import { toast, useErrorToast } from "@/components/dialog";
import {
  changePasscodeAction, clearDemoAction, exportDataAction, loadDemoPricesAction, saveProfileAction, saveTargetsAction, setPriceAction, signOutAction, wipeAllAction,
} from "@/app/actions/data";
import { cn, money } from "@/lib/util";
import type { PriceEntry, Profile, Targets } from "@/lib/types";

const CURRENCIES = [{ id: "EGP", label: "Egyptian pound (EGP)" }, { id: "QAR", label: "Qatari riyal (QAR)" }, { id: "USD", label: "US dollar (USD)" }];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const KIND: Record<string, string> = { manual: "Your price", verified: "Verified", estimate: "Estimate", demo: "Demo" };
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}</label>;
}

export function SettingsClient({ profile, targets, prices, integrations, citation }: {
  profile: Profile; targets: Targets; prices: (PriceEntry & { name: string })[];
  integrations: { anthropic: boolean; database: "postgres" | "embedded"; fdcKey: boolean; passcodeFromEnv: boolean }; citation: string;
}) {
  const onError = useErrorToast();
  const [pending, start] = useTransition();
  const [p, setP] = useState(profile);
  const [diet, setDiet] = useState(profile.diet.join(", "));
  const [allergies, setAllergies] = useState(profile.allergies.join(", "));
  const [dislikes, setDislikes] = useState(profile.dislikes.join(", "));
  const [t, setT] = useState(targets);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [wipe, setWipe] = useState("");
  const [priceQ, setPriceQ] = useState("");
  const run = (fn: () => Promise<unknown>, ok?: string) => start(async () => { try { await fn(); if (ok) toast(ok); } catch (e) { onError(e); } });
  const up = (x: Partial<Profile>) => setP((v) => ({ ...v, ...x }));
  const num = (v: string) => (v === "" ? undefined : Number(v));

  const saveProfile = () => run(() => saveProfileAction({
    name: p.name || undefined, age: p.age, sex: p.sex, heightCm: p.heightCm, weightKg: p.weightKg, targetWeightKg: p.targetWeightKg, activity: p.activity,
    trainingPerWeek: p.trainingPerWeek, goal: p.goal, mealsPerDay: p.mealsPerDay, clinicianKcal: p.clinicianKcal, diet: list(diet), allergies: list(allergies), dislikes: list(dislikes),
  }), "Profile saved");
  const savePrefs = (x: Partial<Profile>) => { up(x); run(() => saveProfileAction(x), "Saved"); };
  const shownPrices = useMemo(() => prices.filter((x) => x.name.toLowerCase().includes(priceQ.toLowerCase())), [prices, priceQ]);
  const otherCurrency = prices.filter((x) => x.currency !== p.currency).length;

  return (
    <div className="rise pb-16">
      <PageHeader eyebrow="Settings" title="Settings">
        <button className="btn btn-ghost" onClick={() => run(() => signOutAction())}><LogOut size={15} />Sign out</button>
      </PageHeader>
      <nav className="no-print flex gap-1.5 overflow-x-auto border-b hairline px-4 py-3 sm:px-8" aria-label="Settings sections">
        {[["profile", "Profile"], ["targets", "Targets"], ["preferences", "Preferences"], ["prices", "Prices"], ["integrations", "Integrations"], ["data", "Data"], ["security", "Security"]].map(([id, l]) => <a key={id} href={`#${id}`} className="chip shrink-0">{l}</a>)}
      </nav>

      <Section id="profile" title="Profile">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Row label="Name (optional)"><input className="field" value={p.name ?? ""} onChange={(e) => up({ name: e.target.value })} /></Row>
          <Row label="Age"><input type="number" className="field tnum" value={p.age ?? ""} onChange={(e) => up({ age: num(e.target.value) })} /></Row>
          <Row label="Sex" hint="Used only for the energy equation."><select className="field" value={p.sex ?? ""} onChange={(e) => up({ sex: (e.target.value || undefined) as Profile["sex"] })}><option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option></select></Row>
          <Row label="Height (cm)"><input type="number" className="field tnum" value={p.heightCm ?? ""} onChange={(e) => up({ heightCm: num(e.target.value) })} /></Row>
          <Row label="Weight (kg)"><input type="number" step="0.1" className="field tnum" value={p.weightKg ?? ""} onChange={(e) => up({ weightKg: num(e.target.value) })} /></Row>
          <Row label="Target weight (kg)"><input type="number" step="0.1" className="field tnum" value={p.targetWeightKg ?? ""} onChange={(e) => up({ targetWeightKg: num(e.target.value) })} /></Row>
          <Row label="Activity"><select className="field" value={p.activity} onChange={(e) => up({ activity: e.target.value as Profile["activity"] })}><option value="sedentary">Mostly sitting</option><option value="light">Lightly active</option><option value="moderate">Moderately active</option><option value="active">Very active</option><option value="very-active">Extremely active</option></select></Row>
          <Row label="Training sessions / week"><input type="number" min={0} max={14} className="field tnum" value={p.trainingPerWeek} onChange={(e) => up({ trainingPerWeek: Number(e.target.value) || 0 })} /></Row>
          <Row label="Goal"><select className="field" value={p.goal} onChange={(e) => up({ goal: e.target.value as Profile["goal"] })}><option value="lose">Lose fat</option><option value="maintain">Maintain</option><option value="gain">Build muscle</option></select></Row>
          <Row label="Meals per day"><select className="field" value={p.mealsPerDay} onChange={(e) => up({ mealsPerDay: Number(e.target.value) })}>{[2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}</select></Row>
          <Row label="Clinician-set energy (kcal)" hint="If a doctor or dietitian gave you a number."><input type="number" className="field tnum" value={p.clinicianKcal ?? ""} onChange={(e) => up({ clinicianKcal: num(e.target.value) })} /></Row>
          <div className="hidden lg:block" />
          <Row label="Diet" hint="Comma separated, e.g. halal, no pork"><input className="field" value={diet} onChange={(e) => setDiet(e.target.value)} /></Row>
          <Row label="Allergies" hint="Recipes containing these are excluded."><input className="field" value={allergies} onChange={(e) => setAllergies(e.target.value)} /></Row>
          <Row label="Dislikes" hint="Used to avoid recipes."><input className="field" value={dislikes} onChange={(e) => setDislikes(e.target.value)} /></Row>
        </div>
        <div className="mt-4 flex justify-end"><button className="btn btn-primary" disabled={pending} onClick={saveProfile}>Save profile</button></div>
        <div className="mt-6 max-w-xl"><EnergySummary profile={p} /></div>
      </Section>

      <Section id="targets" title="Daily targets" className="border-t hairline">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <TargetEditor value={t} onChange={setT} />
            <div className="mt-4 flex gap-2"><button className="btn btn-primary" disabled={pending} onClick={() => run(() => saveTargetsAction(t), "Targets saved")}>Save targets</button><button className="btn btn-ghost" onClick={() => setT(targets)}>Reset</button></div>
            <p className="mt-3 text-[11.5px] text-muted">Plans already generated keep their portions. Use Rebalance or Generate in the planner to apply new targets.</p>
          </div>
          <TargetFlags targets={t} profile={p} />
        </div>
      </Section>

      <Section id="preferences" title="Preferences" className="border-t hairline">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Row label="Currency" hint="Prices are stored per currency; existing prices in another currency aren't converted."><select className="field" value={p.currency} onChange={(e) => savePrefs({ currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Row>
          <Row label="Usual shopping day"><select className="field" value={p.shoppingDay} onChange={(e) => savePrefs({ shoppingDay: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Row>
          <Row label="Daily water target (ml)"><input type="number" step={100} className="field tnum" value={p.waterTargetMl} onChange={(e) => up({ waterTargetMl: Number(e.target.value) || 0 })} onBlur={() => savePrefs({ waterTargetMl: p.waterTargetMl })} /></Row>
        </div>
        <div className="mt-4 space-y-2.5 text-[13px]">
          <label className="flex items-center gap-2"><input type="checkbox" checked={p.hydration} onChange={(e) => savePrefs({ hydration: e.target.checked })} />Track water on the Overview</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={p.supplements} onChange={(e) => savePrefs({ supplements: e.target.checked })} />Protein supplements (whey) can be planned</label>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={p.weeklyProposal} onChange={(e) => savePrefs({ weeklyProposal: e.target.checked })} /><span>Weekly proposal<span className="block text-[12px] text-muted">In the last days of each week the Overview offers to draft next week. It stays a proposal until you confirm it in the planner.</span></span></label>
        </div>
      </Section>

      <Section id="prices" title="Ingredient prices" className="border-t hairline" action={<button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(async () => { const n = await loadDemoPricesAction(); toast(n ? `Loaded ${n} demo prices` : "Every ingredient already has a price"); })}>Load demo prices</button>}>
        <p className="mb-3 max-w-2xl text-[12.5px] text-muted">There&apos;s no live supermarket price feed for Cairo, so estimates are only as good as these numbers. Each price shows where it came from. Demo prices are illustrative EGP figures, not quotes.</p>
        {otherCurrency > 0 && <Notice className="mb-3">{otherCurrency} price(s) are in another currency and are ignored while your currency is {p.currency}.</Notice>}
        {prices.length === 0 ? <p className="text-[13px] text-muted">No prices yet. Add them from the grocery list, a scanned receipt, or load the labelled demo list.</p> : (
          <>
            <input className="field mb-2 max-w-xs" value={priceQ} onChange={(e) => setPriceQ(e.target.value)} placeholder="Filter ingredients" aria-label="Filter prices" />
            <div className="max-h-[420px] overflow-y-auto rounded-[8px] border hairline bg-card">
              <table className="tnum w-full text-[13px]">
                <thead className="sticky top-0 bg-card text-left text-[11.5px] text-muted"><tr><th className="px-3 py-2 font-normal">Ingredient</th><th className="font-normal">Per kg</th><th className="font-normal">Source</th><th className="px-3 font-normal" /></tr></thead>
                <tbody className="divide-y divide-line">{shownPrices.map((x) => <PriceRow key={x.ingredientId} x={x} currency={p.currency} />)}</tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      <Section id="integrations" title="Integrations" className="border-t hairline">
        <ul className="divide-y divide-line rounded-[8px] border hairline bg-card text-[13px]">
          <li className="flex flex-wrap items-start justify-between gap-2 px-4 py-3"><div><p className="font-medium">Anthropic API (Claude)</p><p className="text-[12px] text-muted">Assistant, recipe search and adaptation, meal descriptions and photos, receipt reading. Everything else works without it.</p></div><Status ok={integrations.anthropic} on="Connected" off="Not configured: set ANTHROPIC_API_KEY" /></li>
          <li className="flex flex-wrap items-start justify-between gap-2 px-4 py-3"><div><p className="font-medium">Nutrition data</p><p className="text-[12px] text-muted">{citation} Bundled with the app (8,789 foods), so no key is needed.</p></div><Status ok on="Built in" off="" /></li>
          <li className="flex flex-wrap items-start justify-between gap-2 px-4 py-3"><div><p className="font-medium">Database</p><p className="text-[12px] text-muted">{integrations.database === "postgres" ? "Hosted Postgres via DATABASE_URL." : "Embedded Postgres stored on this server (./.data). Set DATABASE_URL to use Supabase or another hosted Postgres."}</p></div><Status ok on={integrations.database === "postgres" ? "Hosted Postgres" : "Embedded"} off="" /></li>
          <li className="flex flex-wrap items-start justify-between gap-2 px-4 py-3"><div><p className="font-medium">Barcodes</p><p className="text-[12px] text-muted">Open Food Facts, a free crowd-sourced database. Coverage of Egyptian products is limited.</p></div><Status ok on="Public, no key" off="" /></li>
        </ul>
      </Section>

      <Section id="data" title="Your data" className="border-t hairline">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="panel px-4 py-4 text-[13px]"><p className="font-medium">Export</p><p className="mt-1 text-[12px] text-muted">Everything as one JSON file: plans, recipes, logs, inventory, prices.</p>
            <button className="btn btn-secondary btn-sm mt-3" disabled={pending} onClick={() => run(async () => { const s = await exportDataAction(); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([s], { type: "application/json" })); a.download = `mise-export-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href); })}><Download size={14} />Download</button></div>
          <div className="panel px-4 py-4 text-[13px]"><p className="font-medium">Demonstration data</p><p className="mt-1 text-[12px] text-muted">{p.demo ? "Removes demo plans, history, inventory, weights and demo prices. Your own recipes, prices and settings stay." : "No demo data is loaded."}</p>
            <button className="btn btn-secondary btn-sm mt-3" disabled={pending || !p.demo} onClick={() => run(async () => { await clearDemoAction(); up({ demo: false }); }, "Demo data cleared")}>Clear demo data</button></div>
          <div className="panel px-4 py-4 text-[13px]"><p className="font-medium text-clay">Delete everything</p><p className="mt-1 text-[12px] text-muted">Erases all data and starts onboarding again. Your passcode is kept. This can&apos;t be undone.</p>
            <div className="mt-3 flex gap-2"><input className="field h-8 py-0 text-[12.5px]" value={wipe} onChange={(e) => setWipe(e.target.value)} placeholder="Type DELETE" aria-label="Type DELETE to confirm" /><button className="btn btn-sm shrink-0 bg-clay text-ivory disabled:opacity-40" disabled={pending || wipe !== "DELETE"} onClick={() => run(() => wipeAllAction(wipe))}>Delete</button></div></div>
        </div>
      </Section>

      <Section id="security" title="Security" className="border-t hairline">
        {integrations.passcodeFromEnv ? <p className="text-[13px] text-muted">The passcode is set by the APP_PASSCODE environment variable on the server; change it there.</p> : (
          <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
            <Row label="Current passcode"><input type="password" autoComplete="current-password" className="field" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Row>
            <Row label="New passcode" hint="At least 8 characters."><input type="password" autoComplete="new-password" className="field" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Row>
            <Row label="Confirm new"><input type="password" autoComplete="new-password" className="field" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Row>
            <div className="sm:col-span-3"><button className="btn btn-primary" disabled={pending || pw.next.length < 8 || pw.next !== pw.confirm || !pw.current} onClick={() => run(async () => { await changePasscodeAction(pw.current, pw.next); setPw({ current: "", next: "", confirm: "" }); }, "Passcode changed")}>Change passcode</button>{pw.confirm && pw.next !== pw.confirm && <span className="ml-3 text-[12px] text-clay">Passcodes don&apos;t match</span>}</div>
          </div>
        )}
        <p className="mt-6 text-[11.5px] leading-relaxed text-muted">Mise gives general nutrition information and planning tools. It isn&apos;t medical advice and doesn&apos;t replace a doctor or registered dietitian, especially for very low energy intakes, pregnancy, medical conditions or medications.</p>
      </Section>
    </div>
  );
}

function Status({ ok, on, off }: { ok: boolean; on: string; off: string }) {
  return <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px]", ok ? "bg-forest-soft text-forest" : "bg-amber-soft text-[#7a5414]")}>{ok ? on : off}</span>;
}

function PriceRow({ x, currency }: { x: PriceEntry & { name: string }; currency: string }) {
  const onError = useErrorToast();
  const [pending, start] = useTransition();
  const [v, setV] = useState(String(x.perKg));
  const changed = Number(v) !== x.perKg;
  return (
    <tr className={cn(x.currency !== currency && "opacity-50")}>
      <td className="px-3 py-1.5">{x.name}</td>
      <td><input type="number" min={0} step="0.01" className="field h-8 !w-28 py-0 text-[12.5px]" value={v} onChange={(e) => setV(e.target.value)} aria-label={`${x.name} price per kg`} /> <span className="text-[11px] text-muted">{x.currency}</span></td>
      <td className={cn("text-[12px]", x.kind === "demo" ? "text-[#7a5414]" : x.kind === "estimate" ? "text-amber" : "text-forest")}>{KIND[x.kind]}{x.kind !== "demo" && <span className="block text-[10.5px] text-muted">{money(x.perKg, x.currency)}/kg</span>}</td>
      <td className="px-3 text-right">
        {changed && <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => { try { await setPriceAction(x.ingredientId, Number(v), currency, "manual"); toast("Price saved as your price"); } catch (e) { onError(e); } })}>Save</button>}
        <button className="btn btn-ghost btn-sm hover:text-clay" disabled={pending} onClick={() => start(async () => { try { await setPriceAction(x.ingredientId, null, x.currency, "manual"); toast("Price removed"); } catch (e) { onError(e); } })}>Remove</button>
      </td>
    </tr>
  );
}
