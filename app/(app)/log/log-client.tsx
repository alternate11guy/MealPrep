"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Barcode, BookOpen, Camera, MessageSquareText, Search, Store, Trash2, X } from "lucide-react";
import { Notice, PageHeader } from "@/components/ui";
import { toast, useErrorToast } from "@/components/dialog";
import { LogList } from "../log-list";
import { addLogAction, foodsByNdbAction, searchFoodsAction } from "@/app/actions/data";
import { analyzePhotoAction, barcodeAction, parseMealTextAction } from "@/app/actions/ai";
import { imageToBase64 } from "@/lib/image-client";
import { fmt } from "@/lib/nutrition/targets";
import { addDays, cn, formatDay, SLOT_LABEL } from "@/lib/util";
import type { FoodLogEntry, MealSlot, Nutrients } from "@/lib/types";

type Per = Partial<Nutrients>;
type Item = { key: string; name: string; grams: number; ndb?: string; per100g?: Per; matched?: string | null; alternatives?: { ndb: string; name: string }[] };
type Method = FoodLogEntry["method"];
const TABS: { id: string; label: string; icon: typeof Search; method: Method }[] = [
  { id: "search", label: "Search foods", icon: Search, method: "manual" },
  { id: "recipe", label: "From recipes", icon: BookOpen, method: "recipe" },
  { id: "text", label: "Describe it", icon: MessageSquareText, method: "text" },
  { id: "photo", label: "Photo", icon: Camera, method: "photo" },
  { id: "barcode", label: "Barcode", icon: Barcode, method: "barcode" },
  { id: "restaurant", label: "Restaurant / custom", icon: Store, method: "restaurant" },
];
const k = () => Math.random().toString(36).slice(2, 9);

function totalsOf(items: Item[]) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const it of items) if (it.per100g) for (const key of Object.keys(t) as (keyof typeof t)[]) t[key] += ((it.per100g[key] ?? 0) * it.grams) / 100;
  return t;
}

function defaultSlot(): MealSlot {
  const h = new Date().getHours();
  return h < 11 ? "breakfast" : h < 15 ? "lunch" : h < 18 ? "snack" : "dinner";
}

function FoodSearch({ onAdd }: { onAdd: (it: Item) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ ndb: string; name: string; per100g: Nutrients }[]>([]);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return; }
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(async () => { try { setRes(await searchFoodsAction(q)); } catch { setRes([]); } }, 200);
  }, [q]);
  return (
    <div>
      <label className="relative block">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input className="field pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. chicken breast roasted, basmati rice cooked, banana" autoFocus />
      </label>
      {res.length > 0 && (
        <ul className="mt-2 divide-y divide-line rounded-[6px] border hairline bg-card">
          {res.map((f) => (
            <li key={f.ndb}><button className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-[13px] hover:bg-ink/[0.03]" onClick={() => { onAdd({ key: k(), name: f.name, grams: 100, ndb: f.ndb, per100g: f.per100g, matched: f.name }); setQ(""); }}>
              <span className="min-w-0">{f.name}</span><span className="tnum shrink-0 text-[11.5px] text-muted">{fmt(f.per100g.kcal)} kcal · P {fmt(f.per100g.protein, 1)} / 100 g</span>
            </button></li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11.5px] text-muted">USDA SR28 database. Pick the cooked or raw entry that matches how you weighed it.</p>
    </div>
  );
}

export function LogClient({ date, today, tab: initialTab, ai, entries, recipes }: {
  date: string; today: string; tab: string; ai: boolean; entries: (FoodLogEntry & { t: Nutrients })[];
  recipes: { id: string; title: string; slots: MealSlot[]; kcal: number; items: { name: string; grams: number; ndb: string }[] }[];
}) {
  const router = useRouter();
  const onError = useErrorToast();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState(TABS.some((t) => t.id === initialTab) ? initialTab : "search");
  const [slot, setSlot] = useState<MealSlot>(defaultSlot);
  const [name, setName] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [recipeId, setRecipeId] = useState("");
  const [servings, setServings] = useState(1);
  const [barcode, setBarcode] = useState("");
  const [custom, setCustom] = useState({ kcal: "", protein: "", carbs: "", fat: "" });
  const [photo, setPhoto] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const method = TABS.find((t) => t.id === tab)!.method;
  const estimated = method === "text" || method === "photo" || method === "restaurant";

  const reset = () => { setItems([]); setName(""); setNote(null); setError(null); setPhoto(null); };
  const switchTab = (t: string) => { setTab(t); reset(); };
  const hydrate = async (raw: { name: string; grams: number; ndb?: string; matched?: string | null; alternatives?: { ndb: string; name: string }[] }[]) => {
    const ndbs = [...new Set(raw.flatMap((r) => [r.ndb, ...(r.alternatives ?? []).map((a) => a.ndb)]).filter((x): x is string => Boolean(x)))];
    const foods = ndbs.length ? await foodsByNdbAction(ndbs) : [];
    const map = new Map(foods.map((f) => [f.ndb, f]));
    return raw.map((r) => ({ key: k(), name: r.name, grams: r.grams, ndb: r.ndb, matched: r.matched, alternatives: r.alternatives, per100g: r.ndb ? map.get(r.ndb)?.per100g : undefined }));
  };
  const swapMatch = async (key: string, ndb: string) => {
    const [f] = await foodsByNdbAction([ndb]);
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ndb, per100g: f?.per100g, matched: f?.name } : x)));
  };

  const describe = async () => {
    setBusy(true); setError(null);
    const r = await parseMealTextAction(text);
    if (!r.ok) setError(r.error); else { setName(r.data.name); setNote(r.data.notes); setItems(await hydrate(r.data.items)); }
    setBusy(false);
  };
  const onPhoto = async (f?: File) => {
    if (!f) return;
    setBusy(true); setError(null);
    try {
      const img = await imageToBase64(f, 1280);
      setPhoto(img.preview);
      const r = await analyzePhotoAction({ data: img.data, type: img.type }, text || undefined);
      if (!r.ok) setError(r.error); else { setName(r.data.name); setNote(r.data.notes); setItems(await hydrate(r.data.items)); }
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't read that photo."); }
    setBusy(false);
  };
  const lookup = async (code: string) => {
    setBusy(true); setError(null);
    const r = await barcodeAction(code);
    if (!r.ok) setError(r.error);
    else { setName(r.data.name); setNote(`${r.data.source}${r.data.servingSize ? ` · serving ${r.data.servingSize}` : ""}. Check against the package.`); setItems([{ key: k(), name: r.data.name, grams: 100, per100g: Object.fromEntries(Object.entries(r.data.per100g).filter(([, v]) => v != null)) as Per, matched: "Package label" }]); }
    setBusy(false);
  };
  const scan = async () => {
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: ImageBitmapSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!BD) { setError("This browser can't scan barcodes; type the number under the barcode instead."); return; }
    fileRef.current?.click();
  };
  const onBarcodePhoto = async (f?: File) => {
    if (!f) return;
    const BD = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => { detect: (s: ImageBitmapSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    try {
      const codes = await new BD({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] }).detect(await createImageBitmap(f));
      if (!codes.length) { setError("No barcode found in that photo. Try again closer, or type the number."); return; }
      setBarcode(codes[0].rawValue); lookup(codes[0].rawValue);
    } catch { setError("Couldn't read the barcode. Type the number instead."); }
  };

  const save = () => start(async () => {
    try {
      if (tab === "restaurant") {
        const t = { kcal: Number(custom.kcal) || 0, protein: Number(custom.protein) || 0, carbs: Number(custom.carbs) || 0, fat: Number(custom.fat) || 0 };
        await addLogAction({ date, slot, name: name.trim() || "Meal out", method, items: [], totals: t, estimated: true, note: note ?? undefined });
      } else if (tab === "recipe") {
        const r = recipes.find((x) => x.id === recipeId);
        if (!r) return;
        await addLogAction({ date, slot, name: `${r.title}${servings !== 1 ? ` × ${servings}` : ""}`, method, items: r.items.map((i) => ({ name: i.name, grams: Math.round(i.grams * servings * 10) / 10, ndb: i.ndb })), estimated: false });
      } else {
        await addLogAction({
          date, slot, name: name.trim() || items.map((i) => i.name).join(", ").slice(0, 150), method, estimated, note: note ?? undefined,
          items: items.filter((i) => i.grams > 0).map((i) => ({ name: i.name, grams: i.grams, ndb: i.ndb, per100g: i.ndb ? undefined : (i.per100g as Record<string, number> | undefined) })),
        });
      }
      toast("Recorded");
      reset(); setText(""); setRecipeId(""); setCustom({ kcal: "", protein: "", carbs: "", fat: "" }); setBarcode("");
    } catch (e) { onError(e); }
  });

  const t = totalsOf(items);
  const r = recipes.find((x) => x.id === recipeId);
  const canSave = tab === "restaurant" ? Boolean(custom.kcal) : tab === "recipe" ? Boolean(r) : items.some((i) => i.grams > 0 && i.per100g);
  const dayTotal = entries.reduce((s, e) => s + e.t.kcal, 0);

  return (
    <div className="rise pb-16">
      <div className="px-4 pt-5 sm:px-8"><Link href="/" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink"><ArrowLeft size={14} />Overview</Link></div>
      <PageHeader eyebrow="Record food" title={<span className="flex items-center gap-2">{date === today ? "Today" : formatDay(date, { weekday: "long", day: "numeric", month: "short" })}</span>}
        sub="Food outside your plan. Planned meals are recorded from the plan with the Eaten button.">
        <Link href={`/log?date=${addDays(date, -1)}`} className="btn btn-ghost btn-sm">Previous day</Link>
        {date !== today && <Link href="/log" className="btn btn-ghost btn-sm">Today</Link>}
        {date < today && <Link href={`/log?date=${addDays(date, 1)}`} className="btn btn-ghost btn-sm">Next day</Link>}
      </PageHeader>

      <div className="grid gap-8 px-4 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} role="tab" aria-selected={tab === id} className={cn("chip shrink-0", tab === id && "chip-on")} onClick={() => switchTab(id)}><Icon size={13} />{label}</button>
            ))}
          </div>

          <div className="panel mt-4 px-4 py-4">
            {tab === "search" && <FoodSearch onAdd={(it) => setItems((xs) => [...xs, it])} />}

            {tab === "recipe" && (
              <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                <label className="block"><span className="label">Recipe</span><select className="field" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}><option value="">Choose a recipe</option>{recipes.map((x) => <option key={x.id} value={x.id}>{x.title} ({fmt(x.kcal)} kcal/serving)</option>)}</select></label>
                <label className="block"><span className="label">Servings</span><input type="number" min={0.25} step={0.25} className="field tnum" value={servings} onChange={(e) => setServings(Number(e.target.value) || 1)} /></label>
                {r && <p className="tnum text-[12.5px] text-ink-2 sm:col-span-2">{fmt(r.kcal * servings)} kcal, computed from the recipe&apos;s USDA ingredients.</p>}
              </div>
            )}

            {(tab === "text" || tab === "photo") && !ai && <Notice title="This needs an Anthropic API key">Add ANTHROPIC_API_KEY on the server to describe or photograph meals. Search foods works without it.</Notice>}

            {tab === "text" && ai && (
              <div>
                <textarea className="field min-h-20" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Two boiled eggs, a slice of baladi bread and a coffee with milk" />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[11.5px] text-muted">Claude splits it into foods and estimates weights; nutrition comes from USDA matches you can check.</p>
                  <button className="btn btn-primary shrink-0" disabled={busy || text.trim().length < 3} onClick={describe}>{busy ? "Working…" : "Break it down"}</button>
                </div>
              </div>
            )}

            {tab === "photo" && ai && (
              <div>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {photo && <img src={photo} alt="Meal" className="h-28 w-36 rounded-[6px] object-cover" />}
                  <div className="flex-1">
                    <input className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Optional context, e.g. 'grilled kofta, small plate'" />
                    <button className="btn btn-primary mt-2" disabled={busy} onClick={() => fileRef.current?.click()}><Camera size={15} />{busy ? "Estimating…" : photo ? "Use another photo" : "Take or choose a photo"}</button>
                  </div>
                </div>
                <p className="mt-2 text-[11.5px] text-muted">Weights from a photo are rough estimates (often ±30%). The entry is labelled as an estimate; adjust the grams if you know better.</p>
              </div>
            )}

            {tab === "barcode" && (
              <div>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onBarcodePhoto(e.target.files?.[0])} />
                <div className="flex flex-wrap gap-2">
                  <input className="field tnum min-w-48 flex-1" inputMode="numeric" value={barcode} onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ""))} placeholder="Barcode number (8–14 digits)" />
                  <button className="btn btn-primary" disabled={busy || barcode.length < 8} onClick={() => lookup(barcode)}>{busy ? "Looking up…" : "Look up"}</button>
                  <button className="btn btn-secondary" onClick={scan}><Camera size={15} />Scan</button>
                </div>
                <p className="mt-2 text-[11.5px] text-muted">Product data from Open Food Facts, a crowd-sourced database. Many Egyptian products are missing; if so, use Restaurant / custom with the label values.</p>
              </div>
            )}

            {tab === "restaurant" && (
              <div className="grid gap-3 sm:grid-cols-4">
                <label className="block sm:col-span-4"><span className="label">What did you have?</span><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grilled chicken plate, Abou El Sid" /></label>
                {(["kcal", "protein", "carbs", "fat"] as const).map((key) => (
                  <label key={key} className="block"><span className="label">{key === "kcal" ? "Energy (kcal)" : `${key[0].toUpperCase()}${key.slice(1)} (g)`}</span><input type="number" min={0} className="field tnum" value={custom[key]} onChange={(e) => setCustom({ ...custom, [key]: e.target.value })} /></label>
                ))}
                <p className="text-[11.5px] text-muted sm:col-span-4">Use the restaurant&apos;s published values or the package label where available. Recorded as an estimate. For a home-cooked dish you can weigh, Search foods is more accurate.</p>
              </div>
            )}

            {error && <Notice tone="caution" className="mt-3">{error}</Notice>}
          </div>

          {items.length > 0 && tab !== "recipe" && tab !== "restaurant" && (
            <div className="mt-5">
              <div className="flex items-baseline justify-between">
                <h2 className="display text-[19px]">Check and record</h2>
                {estimated && <span className="text-[11.5px] text-amber">Estimate</span>}
              </div>
              {note && <p className="mt-1 text-[12px] text-muted">{note}</p>}
              <label className="mt-3 block"><span className="label">Name</span><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Snack" /></label>
              <ul className="mt-3 divide-y divide-line border-y hairline">
                {items.map((it) => (
                  <li key={it.key} className="grid items-center gap-2 py-2 text-[13px] sm:grid-cols-[1fr_1.3fr_110px_auto]">
                    <span className="min-w-0">{it.name}{it.per100g && <span className="tnum block text-[11px] text-muted">{fmt(((it.per100g.kcal ?? 0) * it.grams) / 100)} kcal · P {fmt(((it.per100g.protein ?? 0) * it.grams) / 100, 1)}</span>}</span>
                    {it.alternatives?.length ? (
                      <select className="field h-9 text-[12px]" value={it.ndb ?? ""} onChange={(e) => swapMatch(it.key, e.target.value)}>
                        {it.ndb && <option value={it.ndb}>{it.matched}</option>}
                        {it.alternatives.map((a) => <option key={a.ndb} value={a.ndb}>{a.name}</option>)}
                      </select>
                    ) : <span className={cn("text-[11.5px]", it.per100g ? "text-muted" : "text-clay")}>{it.per100g ? it.matched : "No database match; not counted"}</span>}
                    <label className="flex items-center gap-1"><input type="number" min={0} className="field tnum h-9 text-[13px]" value={it.grams} onChange={(e) => setItems((xs) => xs.map((x) => (x.key === it.key ? { ...x, grams: Number(e.target.value) || 0 } : x)))} /><span className="text-[11px] text-muted">g</span></label>
                    <button className="btn btn-ghost btn-sm px-2" aria-label={`Remove ${it.name}`} onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))}><X size={14} /></button>
                  </li>
                ))}
              </ul>
              <p className="tnum mt-2 text-[13px]"><b className="font-medium">{fmt(t.kcal)} kcal</b> · P {fmt(t.protein)} g · C {fmt(t.carbs)} g · F {fmt(t.fat)} g</p>
            </div>
          )}

          {(canSave || items.length > 0) && (
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <select className="field !w-auto" value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)} aria-label="Meal">{(["breakfast", "lunch", "dinner", "snack", "supplement"] as MealSlot[]).map((s) => <option key={s} value={s}>{SLOT_LABEL[s]}</option>)}</select>
              {items.length > 0 && <button className="btn btn-ghost" onClick={reset}><Trash2 size={15} />Clear</button>}
              <button className="btn btn-primary" disabled={pending || !canSave} onClick={save}>Record {SLOT_LABEL[slot].toLowerCase()}</button>
            </div>
          )}
        </div>

        <aside>
          <div className="mb-2 flex items-baseline justify-between"><h2 className="display text-[19px]">Recorded</h2><span className="tnum text-[12px] text-muted">{fmt(dayTotal)} kcal outside the plan</span></div>
          {entries.length ? <LogList entries={entries} /> : <p className="text-[13px] text-muted">Nothing recorded outside the plan{date === today ? " today" : ""}.</p>}
          <button className="mt-3 text-[12px] text-forest underline underline-offset-4" onClick={() => router.push(`/plan?day=${date}`)}>Open this day in the planner</button>
        </aside>
      </div>
    </div>
  );
}
