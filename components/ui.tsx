import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/util";
import { targetBounds, fmt, compliance } from "@/lib/nutrition/targets";
import type { Target } from "@/lib/types";

export function PageHeader({ eyebrow, title, children, sub }: { eyebrow?: string; title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-4 border-b hairline px-4 pb-6 pt-7 sm:px-8 md:flex-row md:items-end md:justify-between lg:pt-10">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="display mt-1.5 text-[34px] leading-[1.05] sm:text-[40px]">{title}</h1>
        {sub && <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">{sub}</p>}
      </div>
      {children && <div className="no-print flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Section({ title, action, children, className, id }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("px-4 py-6 sm:px-8", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-baseline justify-between gap-4">
          {title && <h2 className="display text-[22px] leading-tight">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Notice({ tone = "info", title, children, className }: { tone?: "info" | "caution" | "demo" | "ok"; title?: string; children?: React.ReactNode; className?: string }) {
  const styles = {
    info: "border-line bg-paper text-ink-2",
    caution: "border-[#e7c9b8] bg-clay-soft text-[#6f3417]",
    demo: "border-[#e8d4a8] bg-amber-soft text-[#6b4a12]",
    ok: "border-[#cfdccb] bg-forest-soft text-forest",
  }[tone];
  const Icon = tone === "caution" ? AlertTriangle : Info;
  return (
    <div className={cn("flex gap-3 rounded-[6px] border px-3.5 py-3 text-[13px] leading-relaxed", styles, className)}>
      <Icon size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 opacity-80" />
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>}
      </div>
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-[8px] border border-dashed border-line-strong px-6 py-12 text-center">
      <p className="display text-xl">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-5 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, unit, sub, className }: { label: string; value: React.ReactNode; unit?: string; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="eyebrow">{label}</p>
      <p className="mt-1.5 tnum text-[26px] font-medium leading-none tracking-tight">
        {value}{unit && <span className="ml-1 text-[13px] font-normal text-muted">{unit}</span>}
      </p>
      {sub && <p className="mt-1.5 text-[12px] text-muted">{sub}</p>}
    </div>
  );
}

const COLORS: Record<string, string> = { protein: "var(--color-protein)", carbs: "var(--color-carbs)", fat: "var(--color-fat)", kcal: "var(--color-energy)" };

/** Horizontal macro bar: solid = eaten, hatched = planned, band = target bounds. */
export function MacroBar({ label, unit, eaten, planned, target, keyName, compact }: {
  label: string; unit: string; eaten?: number; planned: number; target: Target; keyName: string; compact?: boolean;
}) {
  const b = targetBounds(target);
  const ref = target.mode === "range" ? b.hi : target.mode === "min" ? target.value : Number.isFinite(b.hi) ? b.hi : target.value;
  const max = Math.max(ref * 1.15, planned, eaten ?? 0, 1);
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const color = COLORS[keyName] ?? "var(--color-ink)";
  const shown = eaten ?? planned;
  const status = compliance(shown, target);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn("text-[12.5px] text-ink-2", compact && "text-[12px]")}>{label}</span>
        <span className="tnum text-[12.5px]">
          <span className="font-medium text-ink">{fmt(shown)}</span>
          <span className="text-muted"> / {fmt(target.mode === "range" ? (target.min ?? 0) : target.value)}{target.mode === "range" ? `–${fmt(target.max ?? 0)}` : ""} {unit}</span>
        </span>
      </div>
      <div className="relative mt-1.5 h-[6px] overflow-hidden rounded-full bg-[#ebe5d7]">
        {Number.isFinite(b.hi) && b.lo > 0 && (
          <div className="absolute inset-y-0 bg-ink/[0.07]" style={{ left: pct(b.lo), width: `calc(${pct(b.hi)} - ${pct(b.lo)})` }} />
        )}
        {eaten != null && (
          <div className="absolute inset-y-0 left-0 opacity-30" style={{ width: pct(planned), background: `repeating-linear-gradient(135deg, ${color} 0 3px, transparent 3px 6px)` }} />
        )}
        <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out" style={{ width: pct(shown), background: color }} />
      </div>
      {!compact && (
        <p className={cn("mt-1 text-[11px]", status === "met" ? "text-forest-2" : status === "over" ? "text-clay" : "text-muted")}>
          {status === "met" ? "Within target" : status === "over" ? `${fmt(shown - b.hi)} ${unit} over` : `${fmt(b.lo - shown)} ${unit} to go`}
          {eaten != null && <span className="text-muted"> · {fmt(planned)} {unit} planned</span>}
        </p>
      )}
    </div>
  );
}

export function Ring({ value, max, size = 168, stroke = 10, children, color = "var(--color-forest)", track = "#e7e0cf", planned }: {
  value: number; max: number; size?: number; stroke?: number; children?: React.ReactNode; color?: string; track?: string; planned?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = max > 0 ? Math.min(1, value / max) : 0;
  const pfrac = planned != null && max > 0 ? Math.min(1, planned / max) : 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {planned != null && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.22} strokeWidth={stroke} strokeDasharray={`${pfrac * c} ${c}`} strokeLinecap="round" />}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${frac * c} ${c}`} strokeLinecap="round" style={{ transition: "stroke-dasharray .9s cubic-bezier(.22,1,.36,1)" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="text-[12.5px] font-medium text-forest underline decoration-forest/30 underline-offset-4 hover:decoration-forest">{children}</Link>;
}

export function SourceBadge({ kind, name }: { kind: string; name: string }) {
  const label = kind === "house" ? "House recipe" : kind === "modified" ? "Adapted" : kind === "user" ? "Personal" : name;
  return <span className={cn("chip", kind === "modified" && "border-olive/40 bg-olive-soft")}>{label}</span>;
}
