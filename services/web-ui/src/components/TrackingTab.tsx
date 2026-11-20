import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, getRecentTracking, getTracking, getWorkerStats } from "../api";
import { getErrorMessage } from "../lib/errors";
import { formatDate, formatDateTime, humanizeStatus } from "../lib/format";
import type { Tracking, WorkerStats } from "../types";
import { Icon } from "./icons";
import {
  EmptyState,
  ErrorNotice,
  SectionIntro,
  Skeleton,
  Spinner,
  StatusBadge,
} from "./ui";

const TRACKING_STEPS = ["CONFIRMED", "PROCESSING", "SHIPPED", "IN_TRANSIT", "DELIVERED"] as const;

function trackingErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return "Tracking is not available yet. Fulfilment events may still be processing; try again in a moment.";
  }
  return getErrorMessage(error);
}

function WorkerTelemetry({
  stats,
  loading,
  error,
  onRefresh,
}: {
  stats: WorkerStats | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  if (!stats) {
    return (
      <div className="app-card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-50 text-amber-700">
            <Icon name="chart" className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-ink-950">Fulfilment worker</p>
            <p className="mt-0.5 text-xs text-ink-500">
              {loading ? "Connecting to worker telemetry..." : error ?? "Telemetry is unavailable right now."}
            </p>
          </div>
        </div>
        <button type="button" onClick={onRefresh} className="btn-ghost self-start px-3.5 py-2 text-xs sm:self-auto">
          <Icon name="refresh" className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-ink-900/10 bg-ink-950 text-white shadow-soft">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-3">
          <div className="relative grid h-10 w-10 place-items-center rounded-2xl bg-white/10 text-pulse-300">
            <Icon name="chart" className="h-5 w-5" />
            {stats.running ? (
              <span className="absolute -right-1 -top-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pulse-400 opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-pulse-400 ring-2 ring-ink-950" />
              </span>
            ) : null}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold">Fulfilment worker</p>
              <span
                className={`rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.1em] ${
                  stats.running ? "bg-pulse-300 text-ink-950" : "bg-amber-200 text-amber-950"
                }`}
              >
                {stats.running ? "Consuming" : "Idle"}
              </span>
            </div>
            <p className="mt-1 text-xs text-white/45">
              {stats.consumer_group} · {stats.queue_available ? "Redis stream online" : "queue telemetry unavailable"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 self-start rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-white/75 transition hover:border-white/30 hover:text-white sm:self-auto"
        >
          <Icon name="refresh" className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>
      <div className="grid grid-cols-2 border-t border-white/10 sm:grid-cols-4">
        {[
          { label: "In stream", value: stats.stream_length },
          { label: "Pending", value: stats.pending },
          { label: "Processed", value: stats.processed },
          { label: "Errors", value: stats.errors + stats.dead_lettered },
        ].map((metric) => (
          <div key={metric.label} className="border-r border-white/10 px-5 py-4 last:border-r-0">
            <p className="font-display text-2xl font-semibold text-pulse-300">{metric.value}</p>
            <p className="mt-0.5 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-white/40">{metric.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function JourneyTimeline({ tracking }: { tracking: Tracking }) {
  const activeIndex = TRACKING_STEPS.indexOf(tracking.status as (typeof TRACKING_STEPS)[number]);
  const events = [...tracking.events].reverse();

  return (
    <div className="animate-fade-up">
      <div className="flex flex-col gap-4 border-b border-ink-900/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow">Order journey</p>
          <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink-950 sm:text-3xl">
            {tracking.order_number}
          </h3>
          <p className="mt-1 text-sm text-ink-500">Updated {formatDateTime(tracking.updated_at)}</p>
        </div>
        <StatusBadge status={tracking.status} />
      </div>

      {tracking.status === "EXCEPTION" ? (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0" />
          The carrier reported an exception. Check the activity below or contact support with your order number.
        </div>
      ) : null}

      <div className="mt-7 grid grid-cols-5">
        {TRACKING_STEPS.map((step, index) => {
          const complete = index <= activeIndex;
          const current = index === activeIndex;
          return (
            <div key={step} className="relative flex flex-col items-center">
              {index < TRACKING_STEPS.length - 1 ? (
                <span
                  className={`absolute left-1/2 top-4 h-0.5 w-full ${index < activeIndex ? "bg-ink-950" : "bg-ink-900/10"}`}
                  aria-hidden="true"
                />
              ) : null}
              <span
                className={`relative z-10 grid h-8 w-8 place-items-center rounded-full text-xs font-bold transition ${
                  complete ? "bg-ink-950 text-pulse-300" : "bg-white text-ink-300 ring-1 ring-inset ring-ink-900/15"
                }`}
              >
                {index < activeIndex ? <Icon name="check" className="h-4 w-4" /> : <span className={`h-1.5 w-1.5 rounded-full ${current ? "bg-pulse-300" : "bg-current"}`} />}
                {current ? (
                  <span className="absolute inset-0 -z-10 animate-pulse-ring rounded-full border border-pulse-500" aria-hidden="true" />
                ) : null}
              </span>
              <span
                className={`mt-2 text-center text-[0.58rem] font-bold uppercase leading-4 tracking-[0.08em] sm:text-[0.65rem] ${
                  complete ? "text-ink-800" : "text-ink-400"
                }`}
              >
                {humanizeStatus(step)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-7 grid gap-3 rounded-2xl bg-ink-50/80 p-4 ring-1 ring-inset ring-ink-900/5 sm:grid-cols-3">
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-ink-400">Carrier</p>
          <p className="mt-1 text-sm font-semibold text-ink-900">{tracking.carrier ?? "Assigning"}</p>
        </div>
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-ink-400">Tracking code</p>
          <p className="mt-1 truncate text-sm font-semibold text-ink-900">{tracking.tracking_code ?? "Pending"}</p>
        </div>
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-ink-400">Estimated delivery</p>
          <p className="mt-1 text-sm font-semibold text-ink-900">{formatDate(tracking.estimated_delivery)}</p>
        </div>
      </div>

      <div className="mt-7">
        <div className="flex items-center justify-between gap-3">
          <h4 className="font-display text-lg font-semibold text-ink-950">Tracking activity</h4>
          <span className="text-xs font-semibold text-ink-400">
            {tracking.events.length} {tracking.events.length === 1 ? "event" : "events"}
          </span>
        </div>

        {events.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-ink-50 px-4 py-3 text-sm text-ink-500">
            The tracking record exists but no activity events have arrived yet.
          </p>
        ) : (
          <ol className="mt-4">
            {events.map((event, index) => (
              <li key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
                {index < events.length - 1 ? (
                  <span className="absolute left-[0.65rem] top-7 h-[calc(100%-1rem)] w-px bg-ink-900/10" aria-hidden="true" />
                ) : null}
                <span
                  className={`relative z-10 mt-0.5 grid h-[1.4rem] w-[1.4rem] shrink-0 place-items-center rounded-full ${
                    index === 0
                      ? "bg-pulse-300 text-ink-950 ring-4 ring-pulse-100"
                      : "bg-white text-ink-400 ring-1 ring-inset ring-ink-900/15"
                  }`}
                >
                  {index === 0 ? <Icon name="check" className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <p className="text-sm font-bold text-ink-950">{humanizeStatus(event.status)}</p>
                    <p className="text-xs text-ink-400">{formatDateTime(event.created_at)}</p>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-ink-600">{event.message}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

export function TrackingTab({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState<Tracking | null>(null);
  const [recent, setRecent] = useState<Tracking[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [loadingTracking, setLoadingTracking] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [workerStats, setWorkerStats] = useState<WorkerStats | null>(null);
  const [loadingWorker, setLoadingWorker] = useState(true);
  const [workerError, setWorkerError] = useState<string | null>(null);

  const loadWorker = useCallback(async () => {
    setLoadingWorker(true);
    setWorkerError(null);
    try {
      setWorkerStats(await getWorkerStats());
    } catch (error) {
      setWorkerError(getErrorMessage(error));
    } finally {
      setLoadingWorker(false);
    }
  }, []);

  const loadRecent = useCallback(async (selectFirst: boolean) => {
    setLoadingRecent(true);
    setRecentError(null);
    try {
      const items = await getRecentTracking();
      setRecent(items);
      if (selectFirst && items.length > 0) {
        setSelected(items[0]);
        setQuery(items[0].order_number);
        setTrackingError(null);
      }
    } catch (error) {
      setRecentError(getErrorMessage(error));
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  const loadTracking = useCallback(async (orderNumber: string) => {
    const normalized = orderNumber.trim();
    if (!normalized) {
      setTrackingError("Enter an order number to track.");
      return;
    }
    setQuery(normalized);
    setLoadingTracking(true);
    setTrackingError(null);
    setSelected(null);
    try {
      const tracking = await getTracking(normalized);
      setSelected(tracking);
      setQuery(tracking.order_number);
      setRecent((current) => [tracking, ...current.filter((item) => item.id !== tracking.id)].slice(0, 10));
    } catch (error) {
      setTrackingError(trackingErrorMessage(error));
    } finally {
      setLoadingTracking(false);
    }
  }, []);

  useEffect(() => {
    const initial = initialQuery.trim();
    void loadRecent(!initial);
    void loadWorker();
    if (initial) {
      void loadTracking(initial);
    }
    const interval = window.setInterval(() => {
      void loadWorker();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [initialQuery, loadRecent, loadTracking, loadWorker]);

  const submitTracking = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadTracking(query);
  };

  const selectRecent = (tracking: Tracking) => {
    setSelected(tracking);
    setQuery(tracking.order_number);
    setTrackingError(null);
  };

  return (
    <section className="space-y-6">
      <SectionIntro
        eyebrow="Fulfilment control"
        title="Every order, in motion."
        description="Follow the Redis-backed fulfilment pipeline from order confirmation to delivery. The worker turns async events into a visible tracking timeline."
        action={
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-ink-900/10 bg-white px-3.5 py-2 text-xs font-semibold text-ink-600 sm:self-auto">
            <Icon name="truck" className="h-4 w-4 text-pulse-700" />
            Async tracking
          </div>
        }
      />

      <WorkerTelemetry
        stats={workerStats}
        loading={loadingWorker}
        error={workerError}
        onRefresh={() => void loadWorker()}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <div className="app-card p-5 sm:p-6">
            <p className="eyebrow">Order lookup</p>
            <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight">Track a shipment</h3>
            <form className="mt-5 space-y-3" onSubmit={submitTracking}>
              <div>
                <label htmlFor="tracking-order" className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-ink-500">
                  Order number
                </label>
                <input
                  id="tracking-order"
                  className="input-field uppercase placeholder:normal-case"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="FP-DEMO-0001"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={loadingTracking}>
                {loadingTracking ? <Spinner className="h-4 w-4" label="Loading tracking" /> : <Icon name="truck" className="h-4 w-4" />}
                {loadingTracking ? "Loading journey" : "Track order"}
              </button>
            </form>
            <p className="mt-3 text-xs leading-5 text-ink-400">
              Tip: order numbers are shown after checkout and in the store order history.
            </p>
          </div>

          <div className="app-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Live journeys</p>
                <h3 className="mt-2 font-display text-xl font-semibold tracking-tight">Recent tracking</h3>
              </div>
              <button
                type="button"
                onClick={() => void loadRecent(false)}
                className="grid h-9 w-9 place-items-center rounded-full border border-ink-900/10 text-ink-500 transition hover:border-ink-900/25 hover:text-ink-900"
                aria-label="Refresh recent tracking"
              >
                <Icon name="refresh" className="h-4 w-4" />
              </button>
            </div>

            {recentError ? (
              <div className="mt-4">
                <ErrorNotice message={recentError} onRetry={() => void loadRecent(false)} />
              </div>
            ) : null}

            {loadingRecent ? (
              <div className="mt-4 space-y-2.5">
                <Skeleton className="h-[72px]" />
                <Skeleton className="h-[72px]" />
              </div>
            ) : recent.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon="truck"
                  title="No tracking yet"
                  description="Place an order and its fulfilment journey will appear here."
                />
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {recent.map((item) => {
                  const active = selected?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectRecent(item)}
                      className={`w-full rounded-2xl border px-3.5 py-3 text-left transition ${
                        active
                          ? "border-ink-950 bg-ink-950 text-white"
                          : "border-ink-900/10 bg-white text-ink-950 hover:border-pulse-500 hover:bg-pulse-50/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-bold">{item.order_number}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-[0.08em] ${
                            active ? "bg-white/10 text-pulse-300" : "bg-ink-50 text-ink-500"
                          }`}
                        >
                          {humanizeStatus(item.status)}
                        </span>
                      </div>
                      <p className={`mt-1.5 text-xs ${active ? "text-white/50" : "text-ink-400"}`}>
                        Updated {formatDateTime(item.updated_at)}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="app-card min-h-[520px] p-5 sm:p-7 lg:p-8">
          {loadingTracking ? (
            <div className="space-y-5">
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-16" />
              <Skeleton className="h-44" />
              <Skeleton className="h-24" />
            </div>
          ) : trackingError ? (
            <div className="space-y-5">
              <ErrorNotice title="Tracking is still catching up" message={trackingError} onRetry={() => void loadTracking(query)} />
              <EmptyState
                icon="clock"
                title="Fulfilment events can take a moment"
                description="The order is confirmed. The worker may still be processing the fulfilment event, or the order number may need checking."
              />
            </div>
          ) : selected ? (
            <div>
              <div className="mb-5 flex justify-end">
                <button
                  type="button"
                  className="btn-ghost px-3.5 py-2 text-xs"
                  onClick={() => void loadTracking(selected.order_number)}
                >
                  <Icon name="refresh" className="h-3.5 w-3.5" />
                  Refresh timeline
                </button>
              </div>
              <JourneyTimeline tracking={selected} />
            </div>
          ) : (
            <EmptyState
              icon="truck"
              title="Select a journey"
              description="Choose a recent tracking record or search an order number to see its status, carrier, delivery estimate, and full activity trail."
            />
          )}
        </div>
      </div>
    </section>
  );
}
