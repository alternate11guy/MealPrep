"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, ExternalLink, Globe, Link2, Search } from "lucide-react";
import { Notice, PageHeader } from "@/components/ui";
import { toast } from "@/components/dialog";
import { discoverAction, previewImportAction, saveImportAction } from "@/app/actions/ai";
import { searchFoodsAction } from "@/app/actions/data";
import { cn, SLOT_LABEL } from "@/lib/util";
import type { MealSlot } from "@/lib/types";

type Hit = { title: string; url: string; site: string; why: string };
type Line = { line: string; ingredientId: string | null; grams: number | null; confidence: "high" | "low" | "none"; label?: string };
type Preview = { src: { title: string; description: string; url: string; siteName: string; author?: string; image?: string; servings: number; prepMin: number; cookMin: number; ingredientLines: string[]; steps: string[]; statedNutrition?: Record<string, string> }; mapped: Line[]; usedAi: boolean };

function IngredientMatch({ value, label, onPick, catalog }: { value: string | null; label?: string; onPick: (id: string | null, label?: string) => void; catalog: { id: string; name: string }[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [usda, setUsda] = useState<{ ndb: string; name: string }[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (q.length < 3) { setUsda([]); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => { try { setUsda((await searchFoodsAction(q)).slice(0, 6)); } catch { setUsda([]); } }, 250);
  }, [q]);
  const local = q.length > 1 ? catalog.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 5) : [];
  const current = value ? catalog.find((c) => c.id === value)?.name ?? label ?? value : null;
  return (
    <div className="relative">
      <input className="field h-9 text-[13px]" value={open ? q : current ?? ""} placeholder="Not matched: search" onFocus={() => { setOpen(true); setQ(""); }} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => setQ(e.target.value)} />
      {open && (local.length > 0 || usda.length > 0 || value) && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full min-w-64 overflow-auto rounded-[6px] border hairline bg-card text-[12.5px] shadow-lg">
          {local.map((c) => <li key={c.id}><button type="button" className="w-full px-3 py-1.5 text-left hover:bg-ink/[0.04]" onMouseDown={() => onPick(c.id, c.name)}>{c.name}</button></li>)}
          {usda.length > 0 && <li className="px-3 pb-0.5 pt-2 text-[10.5px] uppercase tracking-wide text-muted">USDA database</li>}
          {usda.map((f) => <li key={f.ndb}><button type="button" className="w-full px-3 py-1.5 text-left hover:bg-ink/[0.04]" onMouseDown={() => onPick(`ndb:${f.ndb}`, f.name)}>{f.name}</button></li>)}
          {value && <li className="border-t hairline"><button type="button" className="w-full px-3 py-1.5 text-left text-clay hover:bg-ink/[0.04]" onMouseDown={() => onPick(null)}>Leave out of nutrition</button></li>}
        </ul>
      )}
    </div>
  );
}

export function DiscoverClient({ ai, initialQuery, initialUrl, domains, catalog }: { ai: boolean; initialQuery: string; initialUrl: string; domains: string[]; catalog: { id: string; name: string }[] }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [url, setUrl] = useState(initialUrl);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [slots, setSlots] = useState<MealSlot[]>(["lunch", "dinner"]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"search" | "preview" | "save" | null>(null);
  const [, start] = useTransition();

  const search = () => start(async () => {
    setError(null); setBusy("search"); setHits(null);
    const r = await discoverAction(q);
    setBusy(null);
    if (!r.ok) setError(r.error); else setHits(r.data);
  });
  const load = (u: string) => start(async () => {
    setError(null); setBusy("preview"); setPreview(null); setUrl(u);
    const r = await previewImportAction(u);
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    setPreview(r.data as Preview); setLines((r.data as Preview).mapped);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  const save = () => start(async () => {
    if (!preview) return;
    setError(null); setBusy("save");
    const r = await saveImportAction(preview.src.url, lines, slots);
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    toast("Recipe imported with its source credited");
    router.push(`/recipes/${r.data}`);
  });
  const patch = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p, confidence: "high" } : l)));
  const toReview = lines.filter((l) => l.confidence !== "high").length;

  return (
    <div className="rise pb-16">
      <div className="px-4 pt-5 sm:px-8"><Link href="/recipes" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink"><ArrowLeft size={14} />Recipe library</Link></div>
      <PageHeader eyebrow="Recipe discovery" title="Find recipes online" sub="Search reputable recipe sites, or paste a link. Imports keep the source, author and link; ingredients are matched to USDA foods so nutrition is calculated, not copied." />

      <div className="grid gap-6 px-4 py-6 sm:px-8 lg:grid-cols-2">
        <section className="panel px-4 py-4">
          <h2 className="display text-[19px]">Search</h2>
          {ai ? (
            <>
              <div className="mt-3 flex gap-2">
                <input className="field" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && q.length >= 3 && search()} placeholder="e.g. high-protein Egyptian chicken dinner, low carb" />
                <button className="btn btn-primary shrink-0" disabled={busy === "search" || q.length < 3} onClick={search}><Search size={15} />{busy === "search" ? "Searching…" : "Search"}</button>
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">Claude searches only: {domains.join(", ")}. Only pages that actually appeared in the search results are shown.</p>
            </>
          ) : (
            <Notice className="mt-3" title="Web search needs an Anthropic API key">Add ANTHROPIC_API_KEY on the server to search sites from here. Pasting a link works without it.</Notice>
          )}
        </section>
        <section className="panel px-4 py-4">
          <h2 className="display text-[19px]">Import from a link</h2>
          <div className="mt-3 flex gap-2">
            <input className="field" type="url" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && url && load(url)} placeholder="https://www.bbcgoodfood.com/recipes/…" />
            <button className="btn btn-secondary shrink-0" disabled={busy === "preview" || !/^https?:\/\//.test(url)} onClick={() => load(url)}><Link2 size={15} />{busy === "preview" ? "Reading…" : "Preview"}</button>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted">Works with pages that publish structured recipe data (most major recipe sites). The page&apos;s robots.txt is respected.</p>
        </section>
      </div>

      {error && <div className="px-4 sm:px-8"><Notice tone="caution">{error}</Notice></div>}

      {preview && (
        <section className="px-4 py-4 sm:px-8">
          <div className="panel overflow-hidden">
            <div className="grid gap-5 border-b hairline p-4 md:grid-cols-[200px_1fr]">
              {preview.src.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.src.image} alt={preview.src.title} className="aspect-[4/3] w-full rounded-[6px] object-cover" referrerPolicy="no-referrer" />
              ) : <div className="grid aspect-[4/3] place-items-center rounded-[6px] bg-sand/40 text-[12px] text-muted">No image on the page</div>}
              <div className="min-w-0">
                <p className="eyebrow">{preview.src.siteName}{preview.src.author && ` · ${preview.src.author}`}</p>
                <h2 className="display mt-1 text-[26px] leading-tight">{preview.src.title}</h2>
                <p className="mt-1.5 line-clamp-3 text-[13px] text-muted">{preview.src.description}</p>
                <p className="tnum mt-2 text-[12.5px] text-ink-2">Serves {preview.src.servings} · prep {preview.src.prepMin} min · cook {preview.src.cookMin} min · {preview.src.steps.length} steps · <a href={preview.src.url} target="_blank" rel="noopener noreferrer" className="text-forest underline underline-offset-4">Open source<ExternalLink size={11} className="ml-0.5 inline -translate-y-px" /></a></p>
                {preview.src.statedNutrition && <p className="mt-1.5 text-[11.5px] text-muted">The site states its own nutrition; it&apos;s not used. Values are recalculated from your matched ingredients.</p>}
                {preview.src.image && <p className="mt-1.5 text-[11.5px] text-muted">The photo stays on {preview.src.siteName} and is shown with credit.</p>}
              </div>
            </div>
            <div className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="display text-[19px]">Check the ingredient matches</h3>
                <span className={cn("text-[12px]", toReview ? "text-amber" : "text-forest-2")}>{toReview ? `${toReview} to review` : "All reviewed"} · matched {preview.usedAi ? "by Claude" : "by keyword"}</span>
              </div>
              <p className="mt-1 text-[12px] text-muted">Grams are raw weight for the whole recipe. Lines left unmatched (for example salt to taste, water) are excluded from nutrition.</p>
              <div className="mt-3 divide-y divide-line border-y hairline">
                {lines.map((l, i) => (
                  <div key={i} className="grid items-center gap-2 py-2 text-[13px] md:grid-cols-[1.2fr_1fr_110px]">
                    <span className={cn("min-w-0", l.confidence === "none" && "text-muted")}>
                      <span className={cn("mr-2 inline-block size-1.5 rounded-full align-middle", l.confidence === "high" ? "bg-forest" : l.confidence === "low" ? "bg-amber" : "bg-line-strong")} />{l.line}
                    </span>
                    <IngredientMatch value={l.ingredientId} label={l.label} catalog={catalog} onPick={(id, label) => patch(i, { ingredientId: id, label })} />
                    <label className="flex items-center gap-1.5"><input type="number" min={0} step={1} className="field tnum h-9 text-[13px]" value={l.grams ?? ""} onChange={(e) => patch(i, { grams: e.target.value ? Number(e.target.value) : null })} placeholder="?" /><span className="text-[12px] text-muted">g</span></label>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12px] text-muted">Use for</span>
                  {(["breakfast", "lunch", "dinner", "snack"] as MealSlot[]).map((s) => <button key={s} className={cn("chip", slots.includes(s) && "chip-on")} onClick={() => setSlots((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))}>{SLOT_LABEL[s]}</button>)}
                </div>
                <button className="btn btn-primary" disabled={busy === "save" || !lines.some((l) => l.ingredientId && l.grams)} onClick={save}>{busy === "save" ? "Saving…" : "Save to my recipes"}</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {hits && (
        <section className="px-4 py-4 sm:px-8">
          <h2 className="display mb-3 text-[20px]">Results</h2>
          {hits.length === 0 ? <p className="text-[13px] text-muted">No matching recipe pages found on those sites. Try different words.</p> : (
            <ul className="grid gap-3 md:grid-cols-2">
              {hits.map((h) => (
                <li key={h.url} className="panel flex flex-col px-4 py-3.5">
                  <p className="eyebrow"><Globe size={11} className="mr-1 inline -translate-y-px" />{h.site}</p>
                  <a href={h.url} target="_blank" rel="noopener noreferrer" className="display mt-1 text-[18px] leading-snug hover:text-forest">{h.title}</a>
                  <p className="mt-1 flex-1 text-[12.5px] text-muted">{h.why}</p>
                  <div className="mt-3"><button className="btn btn-secondary btn-sm" disabled={busy === "preview"} onClick={() => load(h.url)}>Preview import</button></div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
