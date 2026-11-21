"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowUp, Check, ExternalLink, RotateCcw, Sparkles } from "lucide-react";
import { Notice, PageHeader } from "@/components/ui";
import { toast } from "@/components/dialog";
import { assistantAction } from "@/app/actions/ai";
import { addMealAction, rebalanceDayAction, replaceMealAction, setMealStatusAction, setServingsAction } from "@/app/actions/plan";
import { addLogAction } from "@/app/actions/data";
import { cn, formatDay, mondayOf, SLOT_LABEL } from "@/lib/util";
import type { MealSlot } from "@/lib/types";

type Action = {
  type: string; label: string; reason: string; date: string | null; meal_id: string | null; recipe_id: string | null; servings: number | null; slot: MealSlot | null;
  url: string | null; week_start: string | null; preview: { name: string; grams: number; ndb?: string; matched: string | null }[] | null;
};
type Msg = { role: "user" | "assistant"; content: string; actions?: Action[]; sources?: { url: string; title: string }[]; applied?: Record<number, boolean>; error?: boolean };

const STORE = "mise:assistant";
const STARTERS = [
  "What should I eat for the rest of today to hit my protein target?",
  "Make Thursday cheaper without dropping protein",
  "Find me a high-protein Egyptian dinner recipe online",
  "I had koshari for lunch, about one medium bowl. Log it.",
  "Which meals this week use the spinach before it expires?",
  "Is 935 kcal a day realistic for me?",
];

export function AssistantClient({ ai, today, name }: { ai: boolean; today: string; name?: string }) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [applying, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { try { const s = localStorage.getItem(STORE); if (s) setMsgs(JSON.parse(s)); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(msgs.slice(-40))); } catch {} end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: t }];
    setMsgs(next); setInput(""); setBusy(true);
    const history = next.filter((m) => !m.error).slice(-20).map((m) => ({ role: m.role, content: m.content || (m.actions?.length ? `(Proposed: ${m.actions.map((a) => a.label).join("; ")})` : "…") }));
    const r = await assistantAction(history);
    setBusy(false);
    if (!r.ok) { setMsgs([...next, { role: "assistant", content: r.error, error: true }]); return; }
    setMsgs([...next, { role: "assistant", content: r.data.text, actions: r.data.actions as Action[], sources: r.data.sources, applied: {} }]);
  };

  const apply = (mi: number, ai2: number, a: Action) => start(async () => {
    try {
      const week = mondayOf(a.date ?? a.week_start ?? today);
      switch (a.type) {
        case "replace_meal":
          await replaceMealAction(week, a.date!, a.meal_id!, a.recipe_id!, a.servings ?? 1);
          await rebalanceDayAction(week, a.date!);
          break;
        case "set_servings": await setServingsAction(week, a.date!, a.meal_id!, a.servings!); break;
        case "add_meal": await addMealAction(week, a.date!, a.slot ?? "snack", a.recipe_id!, a.servings ?? 1); break;
        case "skip_meal": await setMealStatusAction(week, a.date!, a.meal_id!, "skipped"); break;
        case "rebalance_day": await rebalanceDayAction(week, a.date!); break;
        case "log_food":
          await addLogAction({ date: a.date ?? today, slot: a.slot ?? "snack", name: a.label.replace(/^log\s*/i, "").slice(0, 150) || "Logged food", method: "text", estimated: true, items: (a.preview ?? []).filter((p) => p.ndb).map((p) => ({ name: p.name, grams: p.grams, ndb: p.ndb })) });
          break;
        case "generate_week": router.push(`/plan?week=${mondayOf(a.week_start ?? today)}&generate=1`); return;
        case "import_recipe": router.push(`/recipes/discover?url=${encodeURIComponent(a.url ?? "")}`); return;
        default: throw new Error("Unknown action");
      }
      setMsgs((ms) => ms.map((m, i) => (i === mi ? { ...m, applied: { ...m.applied, [ai2]: true } } : m)));
      toast("Applied");
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't apply that change", "error"); }
  });

  const clear = () => { setMsgs([]); try { localStorage.removeItem(STORE); } catch {} };

  return (
    <div className="rise flex min-h-[calc(100dvh-76px)] flex-col lg:min-h-dvh">
      <PageHeader eyebrow="AI nutrition assistant" title="Ask about your plan" sub="It sees your targets, this and next week's plan, today's food, inventory and recipe library. It proposes changes; nothing changes until you tap Apply.">
        {msgs.length > 0 && <button className="btn btn-ghost" onClick={clear}><RotateCcw size={15} />New conversation</button>}
      </PageHeader>

      <div className="flex-1 px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-3xl space-y-5">
          {!ai && <Notice title="The assistant needs an Anthropic API key">Add ANTHROPIC_API_KEY to the server environment and restart. Everything else in the app works without it.</Notice>}
          {msgs.length === 0 && ai && (
            <div>
              <p className="display text-[24px] leading-snug">{name ? `Hi ${name}. ` : ""}What would you like to sort out?</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {STARTERS.map((s) => <button key={s} className="panel px-3.5 py-3 text-left text-[13px] text-ink-2 transition-colors hover:bg-paper" onClick={() => send(s)}>{s}</button>)}
              </div>
              <p className="mt-4 text-[11.5px] text-muted">General nutrition information, not medical advice. For medical conditions, medications or very low energy intakes, speak with a doctor or registered dietitian.</p>
            </div>
          )}

          {msgs.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[88%] text-[14px] leading-relaxed", m.role === "user" ? "rounded-[14px] rounded-br-[4px] bg-forest px-4 py-2.5 text-ivory" : "min-w-0")}>
                {m.role === "assistant" && <p className="eyebrow mb-1 flex items-center gap-1.5"><Sparkles size={11} />Assistant</p>}
                <div className={cn("whitespace-pre-wrap", m.error && "text-clay")}>{m.content}</div>
                {m.actions && m.actions.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {m.actions.map((a, j) => (
                      <li key={j} className="panel px-3.5 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[13.5px] font-medium">{a.label}</p>
                            <p className="mt-0.5 text-[12px] text-muted">{a.reason}</p>
                            {a.date && <p className="mt-0.5 text-[11.5px] text-muted">{formatDay(a.date, { weekday: "long", day: "numeric", month: "short" })}{a.slot && ` · ${SLOT_LABEL[a.slot]}`}{a.servings ? ` · ${a.servings} serving${a.servings === 1 ? "" : "s"}` : ""}</p>}
                            {a.type === "replace_meal" && <p className="mt-0.5 text-[11.5px] text-muted">Other portions that day are re-optimised to stay on target.</p>}
                            {a.type === "log_food" && a.preview && (
                              <ul className="mt-1.5 text-[11.5px] text-ink-2">{a.preview.map((p, k) => <li key={k}>{p.grams} g {p.name} → {p.matched ?? <span className="text-clay">no USDA match, skipped</span>}</li>)}<li className="text-muted">Weights are Claude&apos;s estimates; nutrition comes from the USDA matches. Recorded as an estimate.</li></ul>
                            )}
                            {a.type === "import_recipe" && a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] text-forest underline underline-offset-2">{new URL(a.url).hostname}<ExternalLink size={10} /></a>}
                          </div>
                          {m.applied?.[j] ? <span className="flex items-center gap-1 text-[12.5px] text-forest-2"><Check size={14} />Applied</span> : (
                            <button className="btn btn-primary btn-sm" disabled={applying} onClick={() => apply(i, j, a)}>{a.type === "import_recipe" ? "Review import" : a.type === "generate_week" ? "Open generator" : "Apply"}</button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {m.sources && m.sources.length > 0 && (
                  <details className="mt-2 text-[11.5px] text-muted"><summary className="cursor-pointer">Sources ({m.sources.length})</summary><ul className="mt-1 space-y-0.5">{m.sources.slice(0, 8).map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{s.title || s.url}</a></li>)}</ul></details>
                )}
              </div>
            </div>
          ))}
          {busy && <p className="text-[13px] text-muted"><span className="inline-block animate-pulse">Thinking with your plan and data…</span></p>}
          <div ref={end} />
        </div>
      </div>

      <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] border-t hairline bg-ivory/95 px-4 py-3 backdrop-blur sm:px-8 lg:bottom-0">
        <form className="mx-auto flex max-w-3xl items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <textarea className="field max-h-40 min-h-11 resize-none" rows={1} value={input} disabled={!ai} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} placeholder={ai ? "Ask anything about your meals, targets or shopping" : "Assistant unavailable until an API key is added"} aria-label="Message" />
          <button className="btn btn-primary h-11 w-11 shrink-0 justify-center px-0" disabled={!ai || busy || !input.trim()} aria-label="Send"><ArrowUp size={18} /></button>
        </form>
        <p className="mx-auto mt-1.5 max-w-3xl text-[10.5px] text-muted">Not medical advice. <Link href="/settings#targets" className="underline">Targets</Link> are yours to set.</p>
      </div>
    </div>
  );
}
