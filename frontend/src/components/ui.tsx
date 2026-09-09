import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-neutral-100 text-neutral-900 hover:bg-neutral-200 disabled:opacity-50",
  secondary:
    "border border-neutral-700 text-neutral-200 hover:bg-neutral-800 disabled:opacity-50",
  ghost: "text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900 disabled:opacity-50",
  danger: "text-neutral-500 hover:text-red-400 disabled:opacity-50",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "primary", className = "", ...rest }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition active:scale-[0.98] disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-neutral-800 bg-neutral-900/40 ${className}`}>
      {children}
    </div>
  );
}

export function SectionHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {sub && <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" }) {
  const tones = {
    neutral: "bg-neutral-800 text-neutral-300",
    good: "bg-emerald-950 text-emerald-300",
    warn: "bg-amber-950 text-amber-300",
  } as const;
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-800 px-4 py-8 text-center">
      <p className="text-sm text-neutral-400">{title}</p>
      {hint && <p className="mt-1 text-xs text-neutral-600">{hint}</p>}
    </div>
  );
}

export function Tabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-neutral-900 p-1 w-fit max-w-full overflow-x-auto" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={value === option.value}
          type="button"
          className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
            value === option.value
              ? "bg-neutral-100 text-neutral-950"
              : "text-neutral-500 hover:text-neutral-200"
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export const inputCls =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none transition-colors placeholder:text-neutral-600 focus:border-neutral-400";
