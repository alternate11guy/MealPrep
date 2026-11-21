"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Camera, Check, Pencil, Plus, Refrigerator, Snowflake, Trash2, Wheat } from "lucide-react";
import { Dialog, toast, useErrorToast } from "@/components/dialog";
import { Empty, Notice, PageHeader } from "@/components/ui";
import { addInventoryBatchAction, removeInventoryAction, setPriceAction, upsertInventoryAction } from "@/app/actions/data";
import { receiptAction } from "@/app/actions/ai";
import { imageToBase64 } from "@/lib/image-client";
import { addDays, cn, daysBetween, formatDay, grams, money } from "@/lib/util";
import type { InventoryItem, StorageLocation } from "@/lib/types";

type Cat = { id: string; name: string; storage: StorageLocation; shelfDays: Partial<Record<StorageLocation, number>> };
const LOC: { id: StorageLocation; label: string; icon: typeof Refrigerator }[] = [
  { id: "fridge", label: "Fridge", icon: Refrigerator },
  { id: "freezer", label: "Freezer", icon: Snowflake },
  { id: "pantry", label: "Pantry", icon: Wheat },
];

function expiryState(expires: string | undefined, today: string) {
  if (!expires) return { tone: "muted", text: "No date" } as const;
  const d = daysBetween(today, expires);
  if (d < 0) return { tone: "clay", text: `Expired ${-d} ${-d === 1 ? "day" : "days"} ago` } as const;
  if (d === 0) return { tone: "clay", text: "Use today" } as const;
  if (d <= 2) return { tone: "amber", text: `Use within ${d} ${d === 1 ? "day" : "days"}` } as const;
  return { tone: "muted", text: `Until ${formatDay(expires, { day: "numeric", month: "short" })}` } as const;
}

export function InventoryClient({ items, today, currency, ai, waste, catalog }: {
  items: InventoryItem[]; today: string; currency: string; ai: boolean;
  waste: { date: string; name: string; grams: number; cost?: number; currency?: string }[]; catalog: Cat[];
}) {
  const onError = useErrorToast();
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState<Partial<InventoryItem> | null>(null);
  const [receipt, setReceipt] = useState(false);
  const run = (fn: () => Promise<unknown>, ok?: string) => start(async () => { try { await fn(); if (ok) toast(ok); } catch (e) { onError(e); } });

  const sorted = useMemo(() => [...items].sort((a, b) => (a.expires ?? "9999").localeCompare(b.expires ?? "9999")), [items]);
  const soon = sorted.filter((i) => i.expires && daysBetween(today, i.expires) <= 2);
  const demo = items.some((i) => i.demo);

  return (
    <div className="rise pb-16">
      <PageHeader eyebrow="Food inventory" title="What you have" sub="The planner prefers recipes that use what's here, the grocery list subtracts it, and confirming a prep session deducts what you cooked.">
        <button className="btn btn-primary" onClick={() => setEdit({ location: "fridge", purchased: today })}><Plus size={15} />Add item</button>
        <button className="btn btn-secondary" onClick={() => setReceipt(true)}><Camera size={15} />Scan a receipt</button>
      </PageHeader>

      <div className="space-y-3 px-4 pt-5 sm:px-8">
        {demo && <Notice tone="demo">Includes demonstration items. They clear with the rest of the demo data in Settings.</Notice>}
        {soon.length > 0 && <Notice tone="caution" title={`${soon.length} ${soon.length === 1 ? "item needs" : "items need"} using soon`}>{soon.map((i) => i.name).join(", ")}. Generating a plan now will favour recipes that use them.</Notice>}
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-8 sm:px-8"><Empty title="Nothing tracked yet" action={<button className="btn btn-primary" onClick={() => setEdit({ location: "fridge", purchased: today })}><Plus size={15} />Add your first item</button>}>Add items by hand, scan a receipt, or tick items off your grocery list and put them into inventory.</Empty></div>
      ) : (
        <div className="grid gap-6 px-4 py-6 sm:px-8 lg:grid-cols-3">
          {LOC.map(({ id, label, icon: Icon }) => {
            const list = sorted.filter((i) => i.location === id);
            return (
              <section key={id} className="min-w-0">
                <h2 className="flex items-center gap-2 text-[13px] font-medium"><Icon size={16} className="text-forest" strokeWidth={1.7} />{label}<span className="font-normal text-muted">{list.length}</span></h2>
                {list.length === 0 ? <p className="mt-3 text-[12.5px] text-muted">Empty.</p> : (
                  <ul className="mt-2 divide-y divide-line border-y hairline">
                    {list.map((i) => {
                      const e = expiryState(i.expires, today);
                      return (
                        <li key={i.id} className="flex items-center gap-2 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px]">{i.name}{i.demo && <span className="tag-demo ml-1.5">demo</span>}</p>
                            <p className="tnum text-[11.5px] text-muted">{grams(i.grams)} · <span className={cn(e.tone === "clay" && "text-clay", e.tone === "amber" && "text-amber")}>{e.text}</span>{!i.ingredientId && " · not linked to nutrition data"}</p>
                          </div>
                          <button className="btn btn-ghost btn-sm px-2" aria-label={`Used up ${i.name}`} title="Used up" disabled={pending} onClick={() => run(() => removeInventoryAction(i.id, "used"), "Marked as used")}><Check size={14} /></button>
                          <button className="btn btn-ghost btn-sm px-2" aria-label={`Edit ${i.name}`} title="Edit" onClick={() => setEdit(i)}><Pencil size={14} /></button>
                          <button className="btn btn-ghost btn-sm px-2 hover:text-clay" aria-label={`Discard ${i.name}`} title="Discard (counts as waste)" disabled={pending} onClick={() => run(() => removeInventoryAction(i.id, "discarded"), "Discarded and logged as waste")}><Trash2 size={14} /></button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {waste.length > 0 && (
        <section className="px-4 sm:px-8">
          <details className="text-[13px]">
            <summary className="cursor-pointer text-muted">Recently discarded ({waste.length})</summary>
            <ul className="mt-2 space-y-1 text-ink-2">{waste.map((w, i) => <li key={i} className="tnum">{formatDay(w.date)} · {w.name} · {grams(w.grams)}{w.cost ? ` · ${money(w.cost, w.currency ?? currency)}` : ""}</li>)}</ul>
          </details>
        </section>
      )}

      {edit && <ItemDialog item={edit} catalog={catalog} today={today} currency={currency} onClose={() => setEdit(null)} />}
      {receipt && <ReceiptDialog ai={ai} catalog={catalog} today={today} currency={currency} onClose={() => setReceipt(false)} />}
    </div>
  );
}

function defaultExpiry(cat: Cat | undefined, loc: StorageLocation, from: string) {
  const d = cat?.shelfDays[loc];
  return d ? addDays(from, d) : undefined;
}

function ItemDialog({ item, catalog, today, currency, onClose }: { item: Partial<InventoryItem>; catalog: Cat[]; today: string; currency: string; onClose: () => void }) {
  const onError = useErrorToast();
  const [pending, start] = useTransition();
  const [v, setV] = useState<Partial<InventoryItem>>(item);
  const [q, setQ] = useState(item.name ?? "");
  const matches = q.length > 1 && !v.ingredientId ? catalog.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];
  const cat = catalog.find((c) => c.id === v.ingredientId);
  const pick = (c: Cat) => {
    const loc = c.storage;
    setV({ ...v, ingredientId: c.id, name: c.name, location: loc, expires: v.expires ?? defaultExpiry(c, loc, v.purchased ?? today) });
    setQ(c.name);
  };
  const save = () => start(async () => {
    try {
      await upsertInventoryAction({ ...v, name: (v.name ?? q).trim(), grams: Number(v.grams) || 0, location: v.location ?? "fridge", currency: v.cost ? currency : undefined, demo: undefined });
      toast(item.id ? "Item updated" : "Item added");
      onClose();
    } catch (e) { onError(e); }
  });
  return (
    <Dialog open onClose={onClose} title={item.id ? "Edit item" : "Add to inventory"}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={pending || !(v.name ?? q).trim()} onClick={save}>{item.id ? "Save" : "Add"}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="relative block sm:col-span-2"><span className="label">Food</span>
          <input className="field" value={q} onChange={(e) => { setQ(e.target.value); setV({ ...v, name: e.target.value, ingredientId: undefined }); }} placeholder="e.g. Chicken breast" autoFocus />
          {matches.length > 0 && <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-[6px] border hairline bg-card shadow-lg">{matches.map((m) => <li key={m.id}><button type="button" className="w-full px-3 py-2 text-left text-[13px] hover:bg-ink/[0.04]" onClick={() => pick(m)}>{m.name}</button></li>)}</ul>}
          <span className="mt-1 block text-[11px] text-muted">{v.ingredientId ? "Linked to the ingredient catalog, so the planner and grocery list can use it." : "Pick a suggestion to link it; unlinked items are tracked by name only."}</span>
        </label>
        <label className="block"><span className="label">Amount (g)</span><input type="number" min={0} className="field tnum" value={v.grams ?? ""} onChange={(e) => setV({ ...v, grams: Number(e.target.value) })} /></label>
        <label className="block"><span className="label">Where</span>
          <select className="field" value={v.location ?? "fridge"} onChange={(e) => { const loc = e.target.value as StorageLocation; setV({ ...v, location: loc, expires: defaultExpiry(cat, loc, v.purchased ?? today) ?? v.expires }); }}>{LOC.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
        </label>
        <label className="block"><span className="label">Bought</span><input type="date" className="field" value={v.purchased ?? ""} onChange={(e) => setV({ ...v, purchased: e.target.value || undefined })} /></label>
        <label className="block"><span className="label">Use by</span><input type="date" className="field" value={v.expires ?? ""} onChange={(e) => setV({ ...v, expires: e.target.value || undefined })} />
          {cat?.shelfDays[v.location ?? "fridge"] && <span className="mt-1 block text-[11px] text-muted">Suggested from USDA FoodKeeper: {cat.shelfDays[v.location ?? "fridge"]} days {v.location}. Use the package date if it&apos;s earlier.</span>}
        </label>
        <label className="block"><span className="label">Cost ({currency}, optional)</span><input type="number" min={0} step="0.01" className="field tnum" value={v.cost ?? ""} onChange={(e) => setV({ ...v, cost: e.target.value ? Number(e.target.value) : undefined })} /></label>
      </div>
    </Dialog>
  );
}

type RLine = { text: string; name: string; ingredientId: string | null; grams: number | null; price: number | null; keep: boolean };

function ReceiptDialog({ ai, catalog, today, currency, onClose }: { ai: boolean; catalog: Cat[]; today: string; currency: string; onClose: () => void }) {
  const onError = useErrorToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [lines, setLines] = useState<RLine[] | null>(null);
  const [meta, setMeta] = useState<{ store: string | null; date: string | null; currency: string | null } | null>(null);
  const [savePrices, setSavePrices] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null); setBusy(true); setLines(null);
    try {
      const img = await imageToBase64(f);
      setPreview(img.preview);
      const r = await receiptAction({ data: img.data, type: img.type });
      if (!r.ok) { setError(r.error); return; }
      setMeta({ store: r.data.store, date: r.data.date, currency: r.data.currency });
      setLines(r.data.items.filter((i) => i.food).map((i) => ({ text: i.text, name: catalog.find((c) => c.id === i.catalog_id)?.name ?? i.name, ingredientId: catalog.some((c) => c.id === i.catalog_id) ? i.catalog_id : null, grams: i.grams, price: i.price, keep: true })));
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't read that image."); } finally { setBusy(false); }
  };
  const currencyMismatch = Boolean(meta?.currency && meta.currency.toUpperCase() !== currency);
  const add = async () => {
    if (!lines) return;
    setBusy(true);
    try {
      const date = meta?.date && /^\d{4}-\d{2}-\d{2}$/.test(meta.date) ? meta.date : today;
      const keep = lines.filter((l) => l.keep && l.grams && l.grams > 0);
      await addInventoryBatchAction(keep.map((l) => {
        const cat = catalog.find((c) => c.id === l.ingredientId);
        const loc = cat?.storage ?? "fridge";
        return { ingredientId: l.ingredientId ?? undefined, name: l.name, grams: l.grams!, location: loc, purchased: date, expires: defaultExpiry(cat, loc, date), cost: l.price ?? undefined, currency: l.price ? currency : undefined };
      }));
      if (savePrices && !currencyMismatch) for (const l of keep) if (l.ingredientId && l.price && l.grams) await setPriceAction(l.ingredientId, Math.round((l.price / l.grams) * 1000 * 100) / 100, currency, "manual");
      toast(`${keep.length} item(s) added`);
      onClose();
    } catch (e) { onError(e); } finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} title="Scan a receipt" wide
      footer={lines ? <><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !lines.some((l) => l.keep && l.grams)} onClick={add}>Add {lines.filter((l) => l.keep && l.grams).length} to inventory</button></> : <button className="btn btn-ghost" onClick={onClose}>Close</button>}>
      {!ai ? (
        <Notice title="Receipt reading needs an Anthropic API key">Add ANTHROPIC_API_KEY on the server to read receipt photos. You can still add items by hand.</Notice>
      ) : (
        <>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          {!lines && (
            <div className="flex flex-col items-center gap-3 rounded-[8px] border border-dashed border-line-strong px-6 py-10 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {preview && <img src={preview} alt="Receipt" className="max-h-48 rounded-[6px]" />}
              <button className="btn btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}><Camera size={15} />{busy ? "Reading the receipt…" : "Take or choose a photo"}</button>
              <p className="max-w-sm text-[12px] text-muted">Claude reads only what&apos;s printed. Weights or prices it can&apos;t see are left blank for you to fill in; nothing is added until you review it.</p>
            </div>
          )}
          {error && <Notice tone="caution" className="mt-3">{error}</Notice>}
          {lines && (
            <div>
              <p className="text-[12.5px] text-muted">{meta?.store ?? "Receipt"}{meta?.date && ` · ${meta.date}`}{meta?.currency && ` · ${meta.currency}`}. Untick anything you don&apos;t want; lines without a weight are skipped.</p>
              {currencyMismatch && <Notice tone="caution" className="mt-2">The receipt looks like it&apos;s in {meta!.currency}, but your currency is {currency}. Prices won&apos;t be saved as your prices.</Notice>}
              <div className="mt-3 divide-y divide-line border-y hairline">
                {lines.map((l, i) => (
                  <div key={i} className="grid items-center gap-2 py-2 text-[13px] sm:grid-cols-[auto_1.3fr_1fr_90px_90px]">
                    <input type="checkbox" checked={l.keep} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} aria-label="Include" />
                    <span className="min-w-0 truncate text-muted" title={l.text}>{l.text}</span>
                    <select className="field h-9 text-[12.5px]" value={l.ingredientId ?? ""} onChange={(e) => { const c = catalog.find((x) => x.id === e.target.value); setLines(lines.map((x, j) => (j === i ? { ...x, ingredientId: c?.id ?? null, name: c?.name ?? x.name } : x))); }}>
                      <option value="">{l.name} (unlinked)</option>{catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <label className="flex items-center gap-1"><input type="number" className="field tnum h-9 text-[12.5px]" value={l.grams ?? ""} placeholder="g?" onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, grams: e.target.value ? Number(e.target.value) : null } : x)))} /><span className="text-[11px] text-muted">g</span></label>
                    <input type="number" className="field tnum h-9 text-[12.5px]" value={l.price ?? ""} placeholder="price" onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, price: e.target.value ? Number(e.target.value) : null } : x)))} aria-label="Price" />
                  </div>
                ))}
              </div>
              {!currencyMismatch && <label className="mt-3 flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={savePrices} onChange={(e) => setSavePrices(e.target.checked)} />Save these as my prices per kg for the grocery list</label>}
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
