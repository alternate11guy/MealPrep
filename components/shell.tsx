"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, BookOpen, CalendarDays, ChefHat, Home, MessageCircle, Refrigerator, Settings, ShoppingBasket, MoreHorizontal, X,
} from "lucide-react";
import { cn } from "@/lib/util";
import { Toaster } from "./toaster";

const NAV = [
  { href: "/", label: "Overview", icon: Home },
  { href: "/plan", label: "Weekly Meal Plan", short: "Plan", icon: CalendarDays },
  { href: "/recipes", label: "Recipe Library", short: "Recipes", icon: BookOpen },
  { href: "/prep", label: "Meal Prep", short: "Prep", icon: ChefHat },
  { href: "/grocery", label: "Grocery List", short: "Grocery", icon: ShoppingBasket },
  { href: "/inventory", label: "Food Inventory", short: "Inventory", icon: Refrigerator },
  { href: "/analytics", label: "Nutrition Analytics", short: "Analytics", icon: BarChart3 },
  { href: "/assistant", label: "AI Nutrition Assistant", short: "Assistant", icon: MessageCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];

const MOBILE_PRIMARY = ["/", "/plan", "/prep", "/grocery"];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function Shell({ children, demo }: { children: React.ReactNode; demo: boolean }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="no-print sticky top-0 hidden h-dvh flex-col border-r hairline bg-paper/70 px-4 py-6 lg:flex">
        <Link href="/" className="px-2">
          <span className="display text-[28px] leading-none text-forest">Mise</span>
          <span className="mt-1 block text-[11px] tracking-wide text-muted">Nutrition &amp; meal prep</span>
        </Link>
        <nav className="mt-8 flex flex-col gap-0.5" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => {
            const on = isActive(path, href);
            return (
              <Link key={href} href={href} aria-current={on ? "page" : undefined}
                className={cn("group flex items-center gap-3 rounded-[5px] px-2.5 py-2 text-[13px] transition-colors",
                  on ? "bg-forest text-ivory" : "text-ink-2 hover:bg-ink/[0.04]")}>
                <Icon size={16} strokeWidth={1.6} className={on ? "text-ivory" : "text-muted group-hover:text-ink-2"} />
                {label}
              </Link>
            );
          })}
        </nav>
        {demo && (
          <Link href="/settings#data" className="mt-auto rounded-[5px] border border-[#e8d4a8] bg-amber-soft px-3 py-2.5 text-[11.5px] leading-snug text-[#7a5414]">
            Showing demonstration data. Clear it in Settings when you're ready.
          </Link>
        )}
      </aside>

      <div className="min-w-0 pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-0">
        {demo && (
          <div className="no-print border-b border-[#e8d4a8] bg-amber-soft px-4 py-2 text-center text-[12px] text-[#7a5414] lg:hidden">
            Demonstration data · <Link href="/settings#data" className="underline">clear</Link>
          </div>
        )}
        {children}
      </div>
      <Toaster />

      {/* Mobile: thumb-reachable tab bar for shopping and cooking */}
      <nav aria-label="Main" className="no-print fixed inset-x-0 bottom-0 z-40 border-t hairline bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="grid grid-cols-5">
          {NAV.filter((n) => MOBILE_PRIMARY.includes(n.href)).map(({ href, label, short, icon: Icon }) => {
            const on = isActive(path, href);
            return (
              <Link key={href} href={href} aria-current={on ? "page" : undefined} className={cn("flex flex-col items-center gap-1 py-2.5 text-[10.5px]", on ? "text-forest" : "text-muted")}>
                <Icon size={21} strokeWidth={on ? 2 : 1.6} />
                {short ?? label}
              </Link>
            );
          })}
          <button onClick={() => setMore(true)} className="flex flex-col items-center gap-1 py-2.5 text-[10.5px] text-muted">
            <MoreHorizontal size={21} strokeWidth={1.6} />More
          </button>
        </div>
      </nav>
      {more && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More sections">
          <button className="absolute inset-0 bg-ink/30" aria-label="Close" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[14px] bg-paper p-4 pb-[calc(16px+env(safe-area-inset-bottom))] rise">
            <div className="mb-2 flex items-center justify-between">
              <span className="eyebrow">Sections</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setMore(false)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {NAV.filter((n) => !MOBILE_PRIMARY.includes(n.href)).map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} onClick={() => setMore(false)} className="flex items-center gap-3 rounded-[6px] border hairline bg-card px-3 py-3.5 text-[13px]">
                  <Icon size={18} strokeWidth={1.6} className="text-forest" />{label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
