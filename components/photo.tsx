/* eslint-disable @next/next/no-img-element */
import type { Photo } from "@/lib/types";
import { cn } from "@/lib/util";

const TINTS = ["#e9e3d3", "#e4e7dc", "#ece2d6", "#e6e2d2", "#e2e6e0"];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Recipe photograph. Licensed photos show their credit; source photos link back to the
 * publisher; recipes without an accurate photo get a designed placeholder that says so.
 */
export function RecipePhoto({ photo, title, className, sizes = "(max-width: 768px) 100vw, 33vw", credit = true, priority = false, small = false }: {
  photo: Photo; title: string; className?: string; sizes?: string; credit?: boolean; priority?: boolean; small?: boolean;
}) {
  if (photo.url && photo.kind !== "placeholder") {
    return (
      <figure className={cn("relative overflow-hidden bg-olive-soft", className)}>
        <img src={photo.url} alt={photo.alt || title} sizes={sizes} loading={priority ? "eager" : "lazy"} decoding="async" className="absolute inset-0 h-full w-full object-cover" referrerPolicy="no-referrer" />
        {credit && (photo.credit || photo.kind === "generated") && (
          <figcaption className="absolute bottom-1.5 right-1.5 max-w-[85%] truncate rounded-[3px] bg-ink/55 px-1.5 py-0.5 text-[9.5px] text-ivory/90 backdrop-blur-sm">
            {photo.kind === "generated" ? "AI-generated illustration" : photo.kind === "source" ? `Photo: ${photo.credit}` : `${photo.credit}${photo.license ? ` · ${photo.license}` : ""}`}
          </figcaption>
        )}
      </figure>
    );
  }
  const tint = TINTS[hash(title) % TINTS.length];
  return (
    <figure className={cn("relative overflow-hidden", className)} style={{ background: tint }} aria-label={`${title} (no photograph yet)`}>
      <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <radialGradient id="plate" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#fffdf8" />
            <stop offset="100%" stopColor="#f3eee2" />
          </radialGradient>
        </defs>
        <ellipse cx="200" cy="160" rx="118" ry="104" fill="#000" opacity="0.05" />
        <circle cx="200" cy="150" r="108" fill="url(#plate)" />
        <circle cx="200" cy="150" r="80" fill="none" stroke="#d9d0bd" strokeWidth="1.2" />
        <circle cx="200" cy="150" r="104" fill="none" stroke="#e6dfcf" strokeWidth="1" />
        <path d="M58 70 v80 M50 70 v28 a8 8 0 0 0 16 0 v-28" stroke="#b9ae95" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M342 70 c14 10 14 50 0 62 v58" stroke="#b9ae95" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
      {!small && <figcaption className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-[22%] text-center">
        <span className="display line-clamp-3 text-[clamp(13px,2.2vw,17px)] italic leading-tight text-ink-2">{title}</span>
      </figcaption>}
      <span className="absolute bottom-1.5 left-1.5 rounded-[3px] bg-paper/80 px-1.5 py-0.5 text-[9px] tracking-wide text-muted">{small ? "No photo yet" : "Placeholder · photo not yet sourced"}</span>
    </figure>
  );
}
