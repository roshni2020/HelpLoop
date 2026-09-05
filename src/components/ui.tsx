"use client";

import type { ReactNode } from "react";

/** Shared shell pieces so every panel in the app sits on the same grid. */

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-ink-900/85 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  subtitle,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-[15px] font-semibold tracking-wide text-white">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-[12.5px] leading-snug text-mist-400">{subtitle}</p>
        )}
      </div>
      {right}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  disabled,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const sizes = {
    sm: "px-3 py-1.5 text-[12.5px]",
    md: "px-4 py-2 text-[15px]",
    lg: "px-5 py-3 text-sm",
  };
  // Gradient buttons use literal white: `text-white` is re-pointed to ink
  // in light mode (globals.css), which is right for text but not for
  // labels sitting on a saturated gradient.
  const variants = {
    primary:
      "bg-gradient-to-r from-violet-500 to-sky-500 text-[#fff] shadow-[0_10px_30px_-10px_rgba(139,92,246,0.9)] hover:brightness-110",
    ghost:
      "border border-white/12 bg-white/5 text-mist-200 hover:border-white/25 hover:bg-white/10",
    danger:
      "bg-gradient-to-r from-rose-500 to-orange-500 text-[#fff] shadow-[0_10px_30px_-10px_rgba(244,63,94,0.9)] hover:brightness-110",
    success:
      "bg-gradient-to-r from-emerald-400 to-teal-400 text-[#052e22] font-semibold shadow-[0_10px_30px_-10px_rgba(16,185,129,0.9)] hover:brightness-110",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[12.5px] font-semibold uppercase tracking-[0.09em] text-mist-400">
          {label}
        </span>
        {hint && <span className="text-[11.5px] text-ink-500">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const CONTROL =
  "w-full rounded-xl border border-white/12 bg-ink-800/80 px-3 py-2.5 text-[15px] text-white outline-none transition placeholder:text-ink-500 focus:border-violet-400/70 focus:ring-2 focus:ring-violet-500/25";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`${CONTROL} appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="%238b95b5"><path d="M4 6l4 4 4-4"/></svg>')] bg-[length:14px] bg-[right_0.7rem_center] bg-no-repeat pr-9 ${props.className ?? ""}`}
    />
  );
}

export function Chip({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "brand";
  title?: string;
}) {
  const tones = {
    neutral: "border-white/12 bg-white/5 text-mist-400",
    good: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    warn: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    bad: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    brand: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Confidence expressed as a bar — a number alone reads as precision we don't have. */
export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone =
    pct >= 75 ? "bg-emerald-400" : pct >= 45 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2" title={`Research confidence ${pct}%`}>
      <div className="h-1 w-14 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${tone} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11.5px] text-mist-400">{pct}%</span>
    </div>
  );
}

export function Empty({ icon, title, body }: { icon: string; title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="text-3xl opacity-70">{icon}</div>
      <p className="text-[15px] font-semibold text-mist-200">{title}</p>
      {body && <p className="max-w-[34ch] text-[12.5px] leading-relaxed text-mist-400">{body}</p>}
    </div>
  );
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}
