"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, ClipboardCopy, Download, PackagePlus, Pencil, Plus, Printer, Share2, Undo2, X } from "lucide-react";
import { Empty, Notice, PageHeader } from "@/components/ui";
import { toast, useErrorToast } from "@/components/dialog";
import { clearAdjustmentAction, setPriceAction, stockFromGroceryAction, updateGroceryAction } from "@/app/actions/data";
import { fmt } from "@/lib/nutrition/targets";
import { cn, formatDay, grams, money, uid, weekDates } from "@/lib/util";
import type { GroceryLine } from "@/lib/services/grocery";
import type { Aisle, GroceryState, PriceEntry } from "@/lib/types";

const KIND_LABEL: Record<string, string> = { manual: "Your price", verified: "Verified", estimate: "Estimate", demo: "Demo price" };
const KIND_STYLE: Record<string, string> = { manual: "text-forest", verified: "text-forest", estimate: "text-amber", demo: "text-[#7a5414]" };

export function GroceryClient(props: {
  weekId: string; prevWeek: string; nextWeek: string; isCurrent: boolean; fromToday: boolean; fromDate?: string; hasPlan: boolean;
  lines: GroceryLine[]; total: number; kinds: string[]; unpriced: number; manual: GroceryState["manual"]; removed: { id: string; name: string }[];
  aisles: { id: Aisle; label: string }[]; currency: string; shoppingDay: number; prices: Record<string, { perKg: number; kind: PriceEntry["kind"] }>;
  catalog: { id: string; name: string; aisle: Aisle }[];
}) {
  const { weekId, currency } = props;
  const router = useRouter();
  const onError = useErrorToast();
  const [pending, start] = useTransition();
  const [checked, setChecked] = useState<Record<string, boolean>>(() => Object.fromEntries(props.lines.map((l) => [l.ingredientId, l.checked])));
  const [manual, setManual] = useState(props.manual);
  const [editing, setEditing] = useState<string | null>(null);
  const [hideDone, setHideDone] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", qty: "", aisle: "other" as Aisle });

  const run = (fn: () => Promise<unknown>, ok?: string) => start(async () => { try { await fn(); if (ok) toast(ok); } catch (e) { onError(e); } });
  const toggle = (id: string) => {
    const v = !checked[id];
    setChecked((c) => ({ ...c, [id]: v }));
    run(() => updateGroceryAction(weekId, { checked: { [id]: v } }));
  };
  const saveManual = (next: GroceryState["manual"]) => { setManual(next); run(() => updateGroceryAction(weekId, { manual: next })); };

  const shown = props.lines.filter((l) => l.toBuy > 0 || l.staple || l.adjusted);
  const covered = props.lines.filter((l) => l.toBuy <= 0 && !l.staple && !l.adjusted);
  const toBuyCount = shown.filter((l) => !l.staple).length + manual.length;
  const doneCount = shown.filter((l) => !l.staple && checked[l.ingredientId]).length + manual.filter((m) => m.checked).length;
  const checkedToStock = shown.filter((l) => checked[l.ingredientId] && l.toBuy > 0 && !l.staple).length;
  const dates = weekDates(weekId);

  const text = useMemo(() => {
    const out = [`Grocery list · ${formatDay(dates[0], { day: "numeric", month: "short" })} – ${formatDay(dates[6], { day: "numeric", month: "short" })}`, ""];
    for (const a of props.aisles) {
      const ls = shown.filter((l) => l.aisle === a.id && !checked[l.ingredientId]);
      const ms = manual.filter((m) => m.aisle === a.id && !m.checked);
      if (!ls.length && !ms.length) continue;
      out.push(a.label.toUpperCase());
      for (const l of ls) out.push(`☐ ${l.name}${l.staple ? " (check pantry)" : ` · ${grams(l.toBuy)}${l.unitHint ? ` (${l.unitHint})` : ""}`}`);
      for (const m of ms) out.push(`☐ ${m.name}${m.qty ? ` · ${m.qty}` : ""}`);
      out.push("");
    }
    if (props.total > 0) out.push(`Estimated ${money(props.total, currency)} (${props.kinds.map((k) => KIND_LABEL[k]?.toLowerCase()).join(", ")} prices)`);
    return out.join("\n");
  }, [shown, manual, checked, props.aisles, props.total, props.kinds, currency, dates]);

  const copy = async () => { try { await navigator.clipboard.writeText(text); toast("List copied"); } catch { toast("Couldn't access the clipboard", "error"); } };
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: "Grocery list", text }); } catch {} }
    else copy();
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = `grocery-${weekId}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="rise pb-16">
      <PageHeader eyebrow="Grocery list" title={<span className="flex items-center gap-1"><Link href={`/grocery?week=${props.prevWeek}`} className="btn btn-ghost btn-sm px-1" aria-label="Previous week"><ChevronLeft size={18} /></Link>{formatDay(dates[0], { day: "numeric", month: "short" })} – {formatDay(dates[6], { day: "numeric", month: "short" })}<Link href={`/grocery?week=${props.nextWeek}`} className="btn btn-ghost btn-sm px-1" aria-label="Next week"><ChevronRight size={18} /></Link></span>}
        sub={props.isCurrent ? (props.fromToday ? <>Meals from today onward that aren&apos;t prepared or eaten yet, minus what&apos;s in your inventory. <Link href={`/grocery?week=${weekId}&all=1`} className="underline underline-offset-4">Include the whole week</Link></> : <>Whole week. <Link href={`/grocery?week=${weekId}`} className="underline underline-offset-4">Only from today</Link></>) : "Everything the plan for this week needs, minus your inventory."}>
        <button className="btn btn-secondary" onClick={share}><Share2 size={15} />Share</button>
        <button className="btn btn-secondary" onClick={copy}><ClipboardCopy size={15} />Copy</button>
        <button className="btn btn-ghost" onClick={download}><Download size={15} />.txt</button>
        <button className="btn btn-ghost" onClick={() => window.print()}><Printer size={15} />Print</button>
      </PageHeader>

      {!props.hasPlan ? (
        <div className="px-4 py-8 sm:px-8"><Empty title="No plan for this week" action={<Link href={`/plan?week=${weekId}&generate=1`} className="btn btn-primary">Generate this week</Link>}>The list is built from your meal plan, so generate or build a plan first. You can still add items by hand below.</Empty></div>
      ) : null}

      <div className="grid gap-8 px-4 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="tnum text-[13px] text-ink-2"><b className="font-medium text-ink">{doneCount}</b> of {toBuyCount} in the basket</p>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-[12.5px] text-muted"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />Hide ticked</label>
              {checkedToStock > 0 && <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(async () => { const n = await stockFromGroceryAction(weekId, props.fromDate); router.refresh(); return n; }, `Added ${checkedToStock} item(s) to inventory`)}><PackagePlus size={14} />Put {checkedToStock} ticked into inventory</button>}
            </div>
          </div>

          {props.aisles.map((a) => {
            const ls = shown.filter((l) => l.aisle === a.id && !l.staple && !(hideDone && checked[l.ingredientId]));
            const ms = manual.filter((m) => m.aisle === a.id && !(hideDone && m.checked));
            if (!ls.length && !ms.length) return null;
            return (
              <section key={a.id} className="mb-6 break-inside-avoid">
                <h2 className="eyebrow mb-1.5">{a.label}</h2>
                <ul className="divide-y divide-line border-y hairline">
                  {ls.map((l) => {
                    const on = Boolean(checked[l.ingredientId]);
                    return (
                      <li key={l.ingredientId} className="py-2.5">
                        <div className="flex items-start gap-3">
                          <input type="checkbox" className="mt-1 size-[18px] shrink-0 accent-[var(--color-forest)]" checked={on} onChange={() => toggle(l.ingredientId)} aria-label={`${l.name} bought`} />
                          <div className={cn("min-w-0 flex-1", on && "opacity-50")}>
                            <div className="flex items-baseline justify-between gap-3">
                              <span className={cn("text-[14px]", on && "line-through")}>{l.name}{l.substitutedFrom && <span className="text-[12px] text-muted"> (instead of {props.catalog.find((c) => c.id === l.substitutedFrom)?.name ?? l.substitutedFrom})</span>}</span>
                              <span className="tnum shrink-0 text-[14px] font-medium">{l.staple ? <span className="text-[12px] font-normal text-muted">check pantry</span> : grams(l.toBuy)}</span>
                            </div>
                            <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[11.5px] text-muted">
                              <span className="min-w-0 truncate">
                                {l.unitHint && <>{l.unitHint} · </>}
                                plan needs {grams(l.needed)}{l.available > 0 && <> · {grams(l.available)} in stock</>}{l.adjusted && <> · <span className="text-amber">quantity edited</span></>}
                              </span>
                              {l.cost ? <span className="tnum shrink-0">{l.cost.amount < 1 ? `< ${money(1, currency)}` : money(l.cost.amount, currency)} <span className={KIND_STYLE[l.cost.kind]}>· {KIND_LABEL[l.cost.kind]}</span></span> : !l.staple && <span className="shrink-0">no price</span>}
                            </div>
                          </div>
                          <button className="no-print btn btn-ghost btn-sm -mr-2 px-2" aria-label={`Edit ${l.name}`} onClick={() => setEditing(editing === l.ingredientId ? null : l.ingredientId)}><Pencil size={14} /></button>
                        </div>
                        {editing === l.ingredientId && (
                          <LineEditor line={l} weekId={weekId} currency={currency} price={props.prices[l.ingredientId]} catalog={props.catalog} onDone={() => setEditing(null)} />
                        )}
                      </li>
                    );
                  })}
                  {ms.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 py-2.5">
                      <input type="checkbox" className="size-[18px] shrink-0 accent-[var(--color-forest)]" checked={m.checked} onChange={() => saveManual(manual.map((x) => (x.id === m.id ? { ...x, checked: !x.checked } : x)))} aria-label={`${m.name} bought`} />
                      <span className={cn("min-w-0 flex-1 text-[14px]", m.checked && "line-through opacity-50")}>{m.name} <span className="text-[11px] text-muted">added by you</span></span>
                      <span className="tnum text-[13px] text-ink-2">{m.qty}</span>
                      <button className="no-print btn btn-ghost btn-sm -mr-2 px-2" aria-label={`Remove ${m.name}`} onClick={() => saveManual(manual.filter((x) => x.id !== m.id))}><X size={14} /></button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {shown.some((l) => l.staple) && (
            <section className="mb-6 break-inside-avoid">
              <h2 className="eyebrow mb-1.5">Pantry check</h2>
              <p className="mb-2 text-[12px] text-muted">Small amounts of spices and staples, not priced. Tap each one off once you've checked you have it.</p>
              <div className="flex flex-wrap gap-1.5">
                {shown.filter((l) => l.staple).map((l) => (
                  <button key={l.ingredientId} className={cn("chip", checked[l.ingredientId] && "chip-on")} onClick={() => toggle(l.ingredientId)} title={`Plan uses ${grams(l.needed)}`}>{l.name}</button>
                ))}
              </div>
            </section>
          )}

          <form className="no-print mt-4 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (!newItem.name.trim()) return; saveManual([...manual, { id: uid("g"), name: newItem.name.trim(), qty: newItem.qty.trim(), aisle: newItem.aisle, checked: false }]); setNewItem({ name: "", qty: "", aisle: newItem.aisle }); }}>
            <input className="field min-w-40 flex-1" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="Add an item (e.g. dish soap, coffee)" aria-label="Item name" />
            <input className="field !w-28" value={newItem.qty} onChange={(e) => setNewItem({ ...newItem, qty: e.target.value })} placeholder="Qty" aria-label="Quantity" />
            <select className="field !w-auto" value={newItem.aisle} onChange={(e) => setNewItem({ ...newItem, aisle: e.target.value as Aisle })} aria-label="Aisle">{props.aisles.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
            <button className="btn btn-secondary"><Plus size={15} />Add</button>
          </form>

          {covered.length > 0 && (
            <details className="no-print mt-8 text-[13px]">
              <summary className="cursor-pointer text-muted">{covered.length} ingredient{covered.length === 1 ? "" : "s"} already covered by your inventory</summary>
              <ul className="mt-2 space-y-1 text-ink-2">{covered.map((l) => <li key={l.ingredientId}>{l.name}: need {grams(l.needed)}, have {grams(l.available)}</li>)}</ul>
            </details>
          )}
          {props.removed.length > 0 && (
            <details className="no-print mt-3 text-[13px]">
              <summary className="cursor-pointer text-muted">{props.removed.length} removed from the list</summary>
              <ul className="mt-2 space-y-1">{props.removed.map((r) => <li key={r.id} className="flex items-center gap-2">{r.name}<button className="text-[12px] text-forest underline underline-offset-4" onClick={() => run(() => clearAdjustmentAction(weekId, r.id), "Restored")}>Restore</button></li>)}</ul>
            </details>
          )}
        </div>

        <aside className="no-print space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="panel px-4 py-4">
            <p className="eyebrow">Estimated cost</p>
            <p className="display tnum mt-1 text-[32px] leading-none">{props.total > 0 ? money(props.total, currency) : "–"}</p>
            <ul className="mt-3 space-y-1 text-[12px] text-muted">
              {props.kinds.map((k) => <li key={k}><span className={KIND_STYLE[k]}>●</span> includes {KIND_LABEL[k].toLowerCase()}s</li>)}
              {props.unpriced > 0 && <li>{props.unpriced} item{props.unpriced === 1 ? "" : "s"} without a price (not counted)</li>}
            </ul>
            <p className="mt-3 text-[11.5px] leading-relaxed text-muted">There is no live price feed for Cairo supermarkets, so prices are only what you enter or demo values that are labelled as such. Tap the pencil on an item to set its price per kg in {currency}. Change currency in Settings.</p>
          </div>
          {props.kinds.includes("demo") && <Notice tone="demo" title="Demo prices in use">Replace them with what you actually pay for accurate totals.</Notice>}
          <div className="panel px-4 py-4 text-[12px] leading-relaxed text-muted">
            <p className="eyebrow mb-1">After shopping</p>
            Tick what you bought, then put it into inventory. Expiry dates are set from conservative USDA FoodKeeper ranges, and the next list subtracts what you have.
          </div>
        </aside>
      </div>
    </div>
  );
}

function LineEditor({ line, weekId, currency, price, catalog, onDone }: { line: GroceryLine; weekId: string; currency: string; price?: { perKg: number; kind: PriceEntry["kind"] }; catalog: { id: string; name: string; aisle: Aisle }[]; onDone: () => void }) {
  const onError = useErrorToast();
  const [pending, start] = useTransition();
  const [qty, setQty] = useState(String(Math.round(line.toBuy)));
  const [perKg, setPerKg] = useState(price ? String(price.perKg) : "");
  const [kind, setKind] = useState<"manual" | "estimate" | "verified">(price && price.kind !== "demo" ? price.kind : "manual");
  const original = line.substitutedFrom ?? line.ingredientId;
  const [sub, setSub] = useState(line.substitutedFrom ? line.ingredientId : "");
  const options = catalog.filter((c) => c.aisle === line.aisle && c.id !== original);
  const run = (fn: () => Promise<unknown>, ok: string) => start(async () => { try { await fn(); toast(ok); onDone(); } catch (e) { onError(e); } });
  return (
    <div className="mt-3 grid gap-3 rounded-[6px] border hairline bg-paper p-3 sm:grid-cols-3">
      <label className="block"><span className="label">Buy (g)</span>
        <div className="flex gap-1.5"><input type="number" min={0} className="field tnum" value={qty} onChange={(e) => setQty(e.target.value)} /><button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => updateGroceryAction(weekId, { adjustments: { [line.ingredientId]: Number(qty) || 0 } }), "Quantity saved")}>Save</button></div>
      </label>
      <label className="block"><span className="label">Price per kg ({currency})</span>
        <div className="flex gap-1.5">
          <input type="number" min={0} step="0.01" className="field tnum" value={perKg} onChange={(e) => setPerKg(e.target.value)} placeholder="e.g. 260" />
          <select className="field !w-auto px-2 text-[12px]" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Price type"><option value="manual">I paid</option><option value="verified">Verified</option><option value="estimate">Estimate</option></select>
          <button className="btn btn-secondary btn-sm" disabled={pending || !perKg} onClick={() => run(() => setPriceAction(line.ingredientId, Number(perKg), currency, kind), "Price saved")}>Save</button>
        </div>
      </label>
      <label className="block"><span className="label">Substitute with</span>
        <div className="flex gap-1.5">
          <select className="field" value={sub} onChange={(e) => setSub(e.target.value)}><option value="">No substitution</option>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => updateGroceryAction(weekId, { substitutions: { [original]: sub } }), sub ? "Substituted on this list" : "Substitution cleared")}>Save</button>
        </div>
        <span className="mt-1 block text-[11px] text-muted">Changes this list only, not the recipe nutrition.</span>
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-3">
        <button className="btn btn-ghost btn-sm hover:text-clay" disabled={pending} onClick={() => run(() => updateGroceryAction(weekId, { removed: { [line.ingredientId]: true } }), "Removed from list")}><X size={14} />Remove from list</button>
        {(line.adjusted || line.substitutedFrom) && <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(async () => { await clearAdjustmentAction(weekId, original); if (original !== line.ingredientId) await clearAdjustmentAction(weekId, line.ingredientId); }, "Reset to plan")}><Undo2 size={14} />Reset to plan</button>}
        <span className="ml-auto self-center text-[11.5px] text-muted">Used in: {line.usedIn.join(", ")}</span>
      </div>
      <p className="text-[11px] text-muted sm:col-span-3">{fmt(line.needed)} g needed across the selected days.</p>
    </div>
  );
}
