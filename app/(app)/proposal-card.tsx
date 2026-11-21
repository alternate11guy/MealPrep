"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Wand2 } from "lucide-react";
import { useErrorToast } from "@/components/dialog";
import { proposeNextWeekAction } from "@/app/actions/plan";

/** Weekly proposal: drafts next week on request; it stays "proposed" until confirmed in the planner. */
export function ProposalCard({ nextWeek, status, label }: { nextWeek: string; status: "none" | "proposed"; label: string }) {
  const onError = useErrorToast();
  const [pending, start] = useTransition();
  const [made, setMade] = useState<number | null>(null);
  if (status === "proposed" || made != null) {
    return (
      <div className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
        <div className="text-[13px]"><p className="font-medium">Next week&apos;s proposal is ready</p><p className="text-muted">{made != null ? `${made} of 7 days on target. ` : ""}Review it, swap anything, then confirm it before you shop. Nothing is final until you do.</p></div>
        <Link href={`/plan?week=${nextWeek}`} className="btn btn-primary">Review proposal</Link>
      </div>
    );
  }
  return (
    <div className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
      <div className="text-[13px]"><p className="font-medium">Plan {label}</p><p className="text-muted">Draft a proposal from this week&apos;s settings, your feedback and what&apos;s in the fridge. You confirm it before it counts.</p></div>
      <button className="btn btn-secondary" disabled={pending} onClick={() => start(async () => { try { const r = await proposeNextWeekAction(); setMade(r.onTarget); } catch (e) { onError(e); } })}><Wand2 size={15} />{pending ? "Drafting…" : "Draft proposal"}</button>
    </div>
  );
}
