import type { ReactNode } from "react";
import { humanizeStatus } from "../lib/format";
import { Icon, type IconName } from "./icons";

const statusStyles: Record<string, string> = {
  CONFIRMED: "bg-sky-50 text-sky-700 ring-sky-200",
  PROCESSING: "bg-amber-50 text-amber-700 ring-amber-200",
  SHIPPED: "bg-violet-50 text-violet-700 ring-violet-200",
  IN_TRANSIT: "bg-pulse-50 text-pulse-800 ring-pulse-200",
  DELIVERED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CANCELLED: "bg-rose-50 text-rose-700 ring-rose-200",
  EXCEPTION: "bg-rose-50 text-rose-700 ring-rose-200",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = statusStyles[status] ?? "bg-ink-50 text-ink-700 ring-ink-200";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-[0.08em] ring-1 ring-inset ${tone}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {humanizeStatus(status)}
    </span>
  );
}

export function Spinner({ className = "h-4 w-4", label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex">
      <span
        aria-hidden="true"
        className={`animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function SectionIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl">{title}</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-ink-600 sm:text-base">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 20,
  disabled = false,
  compact = false,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  compact?: boolean;
}) {
  const update = (next: number) => {
    const safeValue = Number.isFinite(next) ? Math.trunc(next) : min;
    onChange(Math.min(max, Math.max(min, safeValue)));
  };
  const buttonClass = `grid place-items-center rounded-full text-ink-800 transition hover:bg-ink-950 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 ${
    compact ? "h-7 w-7" : "h-9 w-9"
  }`;

  return (
    <div
      className={`inline-flex items-center rounded-full border border-ink-900/10 bg-ink-50/70 p-1 ${
        compact ? "gap-0.5" : "gap-1"
      }`}
    >
      <button
        type="button"
        className={buttonClass}
        onClick={() => update(value - 1)}
        disabled={disabled || value <= min}
        aria-label="Decrease quantity"
      >
        <Icon name="minus" className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(event) => update(Number(event.target.value))}
        disabled={disabled}
        aria-label="Quantity"
        className={`appearance-none border-0 bg-transparent p-0 text-center font-bold text-ink-950 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
          compact ? "w-8 text-xs" : "w-10 text-sm"
        }`}
      />
      <button
        type="button"
        className={buttonClass}
        onClick={() => update(value + 1)}
        disabled={disabled || value >= max}
        aria-label="Increase quantity"
      >
        <Icon name="plus" className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      </button>
    </div>
  );
}

export function ErrorNotice({
  title = "Something went off track",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="font-bold">{title}</p>
        <p className="mt-0.5 leading-5 text-rose-700">{message}</p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-rose-800 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-rose-900"
        >
          <Icon name="refresh" className="h-3.5 w-3.5" />
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  icon = "cube",
  title,
  description,
  children,
}: {
  icon?: IconName;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-900/15 bg-ink-50/60 px-6 py-10 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-ink-600 shadow-sm ring-1 ring-ink-900/5">
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <h3 className="mt-4 font-display text-lg font-semibold text-ink-950">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-6 text-ink-500">{description}</p>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}

export function Skeleton({ className = "h-24" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-ink-900/5 ${className}`} aria-hidden="true" />;
}
