import { assessTargets, energyEstimate } from "@/lib/nutrition/energy";
import type { Profile, Targets } from "@/lib/types";
import { Notice } from "./ui";

export function EnergySummary({ profile }: { profile: Profile }) {
  const est = energyEstimate(profile);
  if (!est) return <p className="text-[12.5px] text-muted">Add age, height and weight to see an estimate of your energy needs.</p>;
  const r = (lo: number, hi: number) => (Math.round(lo) === Math.round(hi) ? `${Math.round(lo)}` : `${Math.round(lo)}–${Math.round(hi)}`);
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-[6px] border hairline bg-card p-3">
        <p className="eyebrow">Resting energy</p>
        <p className="tnum mt-1 text-xl font-medium">{r(est.rmr.lo, est.rmr.hi)}<span className="ml-1 text-xs font-normal text-muted">kcal</span></p>
        <p className="mt-1 text-[11px] text-muted">Mifflin-St Jeor equation</p>
      </div>
      <div className="rounded-[6px] border hairline bg-card p-3">
        <p className="eyebrow">Estimated daily use</p>
        <p className="tnum mt-1 text-xl font-medium">{r(est.tdee.lo, est.tdee.hi)}<span className="ml-1 text-xs font-normal text-muted">kcal</span></p>
        <p className="mt-1 text-[11px] text-muted">Including your activity level</p>
      </div>
      {!profile.sex && <p className="col-span-2 text-[11.5px] text-muted">Shown as a range because the equation differs by sex and none was given.</p>}
    </div>
  );
}

export function TargetFlags({ targets, profile }: { targets: Targets; profile: Profile }) {
  const flags = assessTargets(targets, profile);
  if (!flags.length) return <Notice tone="ok" title="No concerns found with these targets." />;
  return (
    <div className="space-y-2">
      {flags.map((f) => (
        <Notice key={f.title} tone={f.level === "caution" ? "caution" : "info"} title={f.title}>
          {f.detail}
          {f.source && <> <a className="underline underline-offset-2" href={f.source.url} target="_blank" rel="noreferrer">{f.source.label}</a>.</>}
        </Notice>
      ))}
      <p className="text-[11.5px] leading-relaxed text-muted">These are general estimates and reference ranges, not medical advice. Your targets are never changed automatically; a healthcare professional can tell you what's right for you.</p>
    </div>
  );
}
