import { useState } from "react";
import { CalorieTracker } from "./components/CalorieTracker";
import { Icon, type IconName } from "./components/icons";
import { Store } from "./components/Store";
import { TrackingTab } from "./components/TrackingTab";
import type { TabId } from "./types";

const tabs: Array<{ id: TabId; label: string; icon: IconName; description: string }> = [
  { id: "nutrition", label: "Calorie Tracker", icon: "flame", description: "Breakfast fuel and macros" },
  { id: "store", label: "Fitness Store", icon: "bag", description: "Gear, cart, and checkout" },
  { id: "tracking", label: "Tracking", icon: "truck", description: "Order journeys and worker status" },
];

const appEnv = (import.meta.env.VITE_APP_ENV as string | undefined)?.trim() || "dev";
const envTone: Record<string, string> = {
  dev: "bg-pulse-100 text-pulse-800 ring-pulse-200",
  uat: "bg-amber-100 text-amber-800 ring-amber-200",
  staging: "bg-sky-100 text-sky-800 ring-sky-200",
  prod: "bg-rose-100 text-rose-800 ring-rose-200",
};

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("nutrition");
  const [trackingQuery, setTrackingQuery] = useState("");

  const navigateToTab = (tab: TabId) => {
    setActiveTab(tab);
    window.setTimeout(() => {
      document.getElementById("fitpulse-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const trackOrder = (orderNumber: string) => {
    setTrackingQuery(orderNumber);
    navigateToTab("tracking");
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-ink-900/5 bg-[#f4f6f1]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => {
              setActiveTab("nutrition");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="group flex items-center gap-3 rounded-2xl text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-pulse-500/25"
            aria-label="FitPulse home"
          >
            <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-ink-950 text-pulse-300 shadow-lift">
              <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              <Icon name="bolt" className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-display text-lg font-bold tracking-tight text-ink-950">FitPulse</span>
              <span className="block text-[0.58rem] font-bold uppercase tracking-[0.18em] text-ink-400">
                Train · Fuel · Track
              </span>
            </span>
          </button>

          <div className="flex items-center gap-2.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[0.62rem] font-bold uppercase tracking-[0.12em] ring-1 ring-inset ${
                envTone[appEnv] ?? envTone.dev
              }`}
              title={`Deployed environment: ${appEnv}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              <span className="hidden sm:inline">{appEnv} environment</span>
              <span className="sm:hidden">{appEnv}</span>
            </span>
            <button
              type="button"
              onClick={() => navigateToTab("store")}
              className="hidden items-center gap-2 rounded-full bg-ink-950 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-ink-800 sm:inline-flex"
            >
              <Icon name="bag" className="h-4 w-4 text-pulse-300" />
              Shop gear
            </button>
          </div>
        </div>
      </header>

      <main>
        <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8">
          <section className="relative overflow-hidden rounded-[2rem] bg-ink-950 px-5 py-8 text-white shadow-soft sm:px-8 sm:py-10 lg:px-12 lg:py-12">
            <div
              className="pointer-events-none absolute inset-0 opacity-50 [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.09)_1px,transparent_0)] [background-size:22px_22px]"
              aria-hidden="true"
            />
            <div className="pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full bg-pulse-400/15 blur-3xl" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-40 left-1/3 h-80 w-80 rounded-full bg-sky-400/10 blur-3xl" aria-hidden="true" />

            <div className="relative grid items-center gap-10 lg:grid-cols-[1.25fr_0.75fr]">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-white/60 backdrop-blur">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pulse-300 opacity-70" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-pulse-300" />
                  </span>
                  One connected fitness flow
                </div>
                <h1 className="mt-5 max-w-2xl font-display text-[2.5rem] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
                  One pulse for your training, <span className="text-pulse-300">fuel</span>, and gear.
                </h1>
                <p className="mt-4 max-w-xl text-sm leading-6 text-white/55 sm:text-base sm:leading-7">
                  Calculate breakfast macros, stock your training kit, and watch every order move through fulfilment from a single fitness dashboard.
                </p>
                <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
                  <button type="button" className="btn-lime" onClick={() => navigateToTab("store")}>
                    <Icon name="bag" className="h-4 w-4" />
                    Shop the store
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
                    onClick={() => navigateToTab("nutrition")}
                  >
                    <Icon name="flame" className="h-4 w-4 text-pulse-300" />
                    Calculate breakfast
                  </button>
                </div>

                <div className="mt-8 grid gap-2.5 text-xs font-semibold text-white/55 sm:grid-cols-3">
                  {[
                    { icon: "flame" as IconName, label: "Macro-aware breakfast" },
                    { icon: "cube" as IconName, label: "Live gear inventory" },
                    { icon: "truck" as IconName, label: "Async order tracking" },
                  ].map((feature) => (
                    <div key={feature.label} className="flex items-center gap-2.5 rounded-2xl border border-white/[0.07] bg-white/[0.035] px-3.5 py-3">
                      <Icon name={feature.icon} className="h-4 w-4 shrink-0 text-pulse-300" />
                      {feature.label}
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative hidden min-h-[340px] items-center justify-center lg:flex">
                <div className="absolute h-80 w-80 rounded-full border border-white/[0.07]" aria-hidden="true" />
                <div className="absolute h-60 w-60 rounded-full border border-dashed border-pulse-300/20" aria-hidden="true" />
                <div className="absolute h-40 w-40 rounded-full bg-pulse-400/10 blur-2xl" aria-hidden="true" />

                <div className="relative w-full max-w-sm rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-5 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.9)] backdrop-blur-xl">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-pulse-300">The FitPulse loop</p>
                      <p className="mt-1 font-display text-lg font-semibold">Fuel. Equip. Follow.</p>
                    </div>
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pulse-400 opacity-50" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-pulse-400" />
                    </span>
                  </div>

                  <div className="relative mt-5 space-y-2.5">
                    <span className="absolute left-[1.4rem] top-9 h-[calc(100%-4.5rem)] w-px bg-white/10" aria-hidden="true" />
                    {[
                      {
                        icon: "flame" as IconName,
                        title: "Fuel",
                        copy: "Server-calculated breakfast macros",
                      },
                      {
                        icon: "dumbbell" as IconName,
                        title: "Equip",
                        copy: "Transactional stock and fast checkout",
                      },
                      {
                        icon: "truck" as IconName,
                        title: "Follow",
                        copy: "Redis events become live tracking",
                      },
                    ].map((step) => (
                      <div key={step.title} className="relative flex items-center gap-3.5 rounded-2xl border border-white/[0.08] bg-ink-950/40 p-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-pulse-300 text-ink-950">
                          <Icon name={step.icon} className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-sm font-bold">{step.title}</p>
                          <p className="mt-0.5 text-[0.68rem] text-white/45">{step.copy}</p>
                        </div>
                        <Icon name="arrowRight" className="ml-auto h-3.5 w-3.5 text-white/25" />
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-white/35">
                    <span>Web · Nutrition · Commerce · Events</span>
                    <span className="text-pulse-300">Synced</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div id="fitpulse-workspace" className="scroll-mt-24 pt-6 sm:pt-8">
            <div className="rounded-2xl border border-ink-900/10 bg-white/85 p-1.5 shadow-soft backdrop-blur-xl">
              <div role="tablist" aria-label="FitPulse sections" className="grid grid-cols-3 gap-1">
                {tabs.map((tab) => {
                  const active = tab.id === activeTab;
                  return (
                    <button
                      key={tab.id}
                      id={`tab-${tab.id}`}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-controls={`panel-${tab.id}`}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center justify-center gap-2 rounded-xl px-2.5 py-3 text-left transition sm:justify-start sm:px-4 ${
                        active
                          ? "bg-ink-950 text-white shadow-lift"
                          : "text-ink-500 hover:bg-ink-50 hover:text-ink-900"
                      }`}
                    >
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                          active ? "bg-white/10 text-pulse-300" : "bg-ink-50 text-ink-500"
                        }`}
                      >
                        <Icon name={tab.icon} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-bold sm:text-sm">{tab.label}</span>
                        <span className={`hidden truncate text-[0.65rem] sm:block ${active ? "text-white/40" : "text-ink-400"}`}>
                          {tab.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              id={`panel-${activeTab}`}
              role="tabpanel"
              aria-labelledby={`tab-${activeTab}`}
              className="pt-8"
            >
              {activeTab === "nutrition" ? <CalorieTracker /> : null}
              {activeTab === "store" ? <Store onTrack={trackOrder} /> : null}
              {activeTab === "tracking" ? <TrackingTab initialQuery={trackingQuery} /> : null}
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-ink-900/5 bg-white/40">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-7 text-xs text-ink-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-ink-950 text-pulse-300">
              <Icon name="bolt" className="h-3.5 w-3.5" />
            </span>
            <span className="font-semibold text-ink-600">FitPulse</span>
            <span>Nutrition, commerce, and fulfilment in one flow.</span>
          </div>
          <p className="font-semibold uppercase tracking-[0.14em]">Built for dev · uat · staging · prod</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
