import { useCallback, useEffect, useMemo, useState } from "react";
import { calculateCalories, getFoods } from "../api";
import { getErrorMessage } from "../lib/errors";
import { formatCalories, formatMacro } from "../lib/format";
import type { CalorieCalculation, Food } from "../types";
import { Icon } from "./icons";
import { ErrorNotice, QuantityStepper, SectionIntro, Skeleton, Spinner } from "./ui";

interface MacroDisplay {
  label: string;
  grams: number;
  share: number;
  barClass: string;
  textClass: string;
}

function macroBreakdown(result: CalorieCalculation): MacroDisplay[] {
  const proteinCalories = result.totals.protein_g * 4;
  const carbCalories = result.totals.carbs_g * 4;
  const fatCalories = result.totals.fat_g * 9;
  const total = proteinCalories + carbCalories + fatCalories;

  const share = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

  return [
    {
      label: "Protein",
      grams: result.totals.protein_g,
      share: share(proteinCalories),
      barClass: "bg-sky-300",
      textClass: "text-sky-200",
    },
    {
      label: "Carbs",
      grams: result.totals.carbs_g,
      share: share(carbCalories),
      barClass: "bg-amber-300",
      textClass: "text-amber-200",
    },
    {
      label: "Fat",
      grams: result.totals.fat_g,
      share: share(fatCalories),
      barClass: "bg-clay-300",
      textClass: "text-clay-200",
    },
  ];
}

export function CalorieTracker() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [result, setResult] = useState<CalorieCalculation | null>(null);
  const [loadingFoods, setLoadingFoods] = useState(true);
  const [foodsError, setFoodsError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [calculationError, setCalculationError] = useState<string | null>(null);

  const loadFoods = useCallback(async () => {
    setLoadingFoods(true);
    setFoodsError(null);
    try {
      const items = await getFoods();
      setFoods(items);
      setSelectedId((current) => {
        if (current && items.some((food) => String(food.id) === current)) {
          return current;
        }
        return items.length > 0 ? String(items[0].id) : "";
      });
    } catch (error) {
      setFoodsError(getErrorMessage(error));
    } finally {
      setLoadingFoods(false);
    }
  }, []);

  useEffect(() => {
    void loadFoods();
  }, [loadFoods]);

  const selectedFood = useMemo(
    () => foods.find((food) => String(food.id) === selectedId) ?? null,
    [foods, selectedId],
  );

  const handleCalculate = async () => {
    if (!selectedFood) {
      return;
    }
    setCalculating(true);
    setCalculationError(null);
    try {
      const calculation = await calculateCalories(selectedFood.id, quantity);
      setResult(calculation);
    } catch (error) {
      setCalculationError(getErrorMessage(error));
      setResult(null);
    } finally {
      setCalculating(false);
    }
  };

  const chooseFood = (food: Food) => {
    setSelectedId(String(food.id));
    setQuantity(1);
    setResult(null);
    setCalculationError(null);
  };

  const macros = result ? macroBreakdown(result) : [];

  return (
    <section className="space-y-6">
      <SectionIntro
        eyebrow="Nutrition lab"
        title="Breakfast, decoded."
        description="Choose from the live breakfast catalog, set your servings, and let FitPulse turn the numbers into a clear fuel breakdown."
        action={
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-pulse-200 bg-pulse-50 px-3.5 py-2 text-xs font-semibold text-pulse-800 sm:self-auto">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pulse-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-pulse-600" />
            </span>
            Live nutrition catalog
          </div>
        }
      />

      {foodsError ? <ErrorNotice message={foodsError} onRetry={() => void loadFoods()} /> : null}

      <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="app-card flex flex-col p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Build your plate</p>
              <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight">Set the serving</h3>
            </div>
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-pulse-100 text-pulse-800">
              <Icon name="flame" className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-7 space-y-5">
            <div>
              <label htmlFor="breakfast-food" className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-ink-500">
                Breakfast item
              </label>
              <div className="relative">
                <select
                  id="breakfast-food"
                  className="input-field appearance-none pr-11"
                  value={selectedId}
                  onChange={(event) => {
                    setSelectedId(event.target.value);
                    setResult(null);
                    setCalculationError(null);
                  }}
                  disabled={loadingFoods || foods.length === 0}
                >
                  {loadingFoods ? <option value="">Loading catalog...</option> : null}
                  {!loadingFoods && foods.length === 0 ? <option value="">No breakfast items available</option> : null}
                  {foods.map((food) => (
                    <option key={food.id} value={food.id}>
                      {food.name} · {formatCalories(food.calories)} kcal
                    </option>
                  ))}
                </select>
                <Icon
                  name="arrowRight"
                  className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-ink-400"
                />
              </div>
            </div>

            {selectedFood ? (
              <div className="rounded-2xl bg-ink-50/80 p-4 ring-1 ring-inset ring-ink-900/5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold leading-5 text-ink-800">{selectedFood.description}</p>
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-ink-500 ring-1 ring-ink-900/5">
                    {selectedFood.serving_size}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-ink-600">
                  <span className="rounded-full bg-white px-2.5 py-1">{formatCalories(selectedFood.calories)} kcal / serving</span>
                  <span className="rounded-full bg-white px-2.5 py-1">{formatMacro(selectedFood.protein_g)} g protein</span>
                  <span className="rounded-full bg-white px-2.5 py-1">{formatMacro(selectedFood.carbs_g)} g carbs</span>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-ink-500">Servings</span>
                <QuantityStepper
                  value={quantity}
                  onChange={(value) => {
                    setQuantity(value);
                    setResult(null);
                    setCalculationError(null);
                  }}
                  min={1}
                  max={20}
                  disabled={!selectedFood}
                />
              </div>
              <p className="text-xs font-medium text-ink-500">
                {selectedFood ? `1 serving = ${selectedFood.serving_size}` : "Pick an item to continue"}
              </p>
            </div>

            <button
              type="button"
              className="btn-lime w-full py-3.5"
              onClick={() => void handleCalculate()}
              disabled={!selectedFood || calculating || loadingFoods}
            >
              {calculating ? <Spinner className="h-4 w-4" label="Calculating nutrition" /> : <Icon name="bolt" className="h-4 w-4" />}
              {calculating ? "Calculating fuel" : "Calculate fuel"}
            </button>
          </div>

          <div className="mt-6 flex items-start gap-2 rounded-2xl border border-ink-900/5 bg-ink-50/60 px-3.5 py-3 text-xs leading-5 text-ink-500">
            <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-pulse-700" />
            Macros are calculated server-side from the FitPulse breakfast catalog, so packaged items and serving sizes stay consistent.
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[1.75rem] bg-ink-950 p-6 text-white shadow-soft sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-pulse-400/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-20 h-64 w-64 rounded-full bg-clay-500/10 blur-3xl" />

          <div className="relative flex min-h-[400px] flex-col">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-pulse-300">Fuel breakdown</p>
              {result ? (
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-inset ring-white/10">
                  {result.quantity} {result.quantity === 1 ? "serving" : "servings"}
                </span>
              ) : null}
            </div>

            <div aria-live="polite" className="flex flex-1 flex-col">
              {calculationError ? (
                <div className="mt-5">
                  <ErrorNotice message={calculationError} onRetry={() => void handleCalculate()} />
                </div>
              ) : null}

              {result ? (
                <div className="animate-fade-up">
                  <div className="mt-7 flex items-end gap-3">
                    <span className="font-display text-6xl font-semibold tracking-[-0.05em] text-pulse-300 sm:text-7xl">
                      {formatCalories(result.totals.calories)}
                    </span>
                    <span className="mb-2 text-sm font-bold uppercase tracking-[0.15em] text-white/50">kcal</span>
                  </div>
                  <p className="mt-3 max-w-md font-display text-xl font-semibold text-white">{result.food.name}</p>
                  <p className="mt-1 text-sm text-white/55">
                    {result.quantity} × {result.food.serving_size}
                  </p>

                  <div className="mt-8 space-y-4">
                    {macros.map((macro) => (
                      <div key={macro.label}>
                        <div className="flex items-center justify-between gap-4 text-sm">
                          <span className="font-semibold text-white/80">{macro.label}</span>
                          <span className="font-mono text-xs text-white/55">
                            {formatMacro(macro.grams)} g · {macro.share}% of macro calories
                          </span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className={`h-full rounded-full ${macro.barClass} transition-[width] duration-500`}
                            style={{ width: `${macro.share}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-8 grid grid-cols-3 gap-3 border-t border-white/10 pt-5">
                    <div>
                      <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-white/40">Protein</p>
                      <p className={`mt-1 font-display text-2xl font-semibold ${macros[0]?.textClass ?? "text-white"}`}>
                        {formatMacro(result.totals.protein_g)}
                        <span className="ml-1 text-xs font-medium text-white/40">g</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-white/40">Carbs</p>
                      <p className={`mt-1 font-display text-2xl font-semibold ${macros[1]?.textClass ?? "text-white"}`}>
                        {formatMacro(result.totals.carbs_g)}
                        <span className="ml-1 text-xs font-medium text-white/40">g</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-white/40">Fat</p>
                      <p className={`mt-1 font-display text-2xl font-semibold ${macros[2]?.textClass ?? "text-white"}`}>
                        {formatMacro(result.totals.fat_g)}
                        <span className="ml-1 text-xs font-medium text-white/40">g</span>
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 flex-col justify-between gap-10">
                  <div className="mt-7 max-w-sm">
                    <h3 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                      Your numbers land here.
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-white/55">
                      Choose a breakfast, set your servings, and calculate. Calories, protein, carbs, and fat arrive together.
                    </p>
                  </div>
                  <div className="relative mx-auto mb-2 grid h-40 w-40 place-items-center">
                    <div className="absolute inset-0 rounded-full border border-white/10" />
                    <div className="absolute inset-5 rounded-full border border-dashed border-pulse-300/25" />
                    <div className="absolute inset-10 rounded-full border border-white/10" />
                    <div className="grid h-16 w-16 place-items-center rounded-2xl bg-pulse-300 text-ink-950 shadow-[0_0_60px_rgba(190,242,100,0.25)]">
                      <Icon name="flame" className="h-7 w-7" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="app-card p-6 sm:p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">On the menu</p>
            <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight">Breakfast quick picks</h3>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">
            {loadingFoods ? "Loading..." : `${foods.length} items`}
          </p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {loadingFoods
            ? Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-[76px]" />)
            : foods.map((food) => {
                const selected = food.id === selectedFood?.id;
                return (
                  <button
                    key={food.id}
                    type="button"
                    onClick={() => chooseFood(food)}
                    aria-pressed={selected}
                    className={`group flex items-center gap-3.5 rounded-2xl border p-4 text-left transition ${
                      selected
                        ? "border-ink-950 bg-ink-950 text-white"
                        : "border-ink-900/10 bg-white text-ink-950 hover:-translate-y-0.5 hover:border-pulse-500 hover:shadow-lift"
                    }`}
                  >
                    <div
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl transition ${
                        selected ? "bg-pulse-300 text-ink-950" : "bg-pulse-50 text-pulse-800 group-hover:bg-pulse-100"
                      }`}
                    >
                      <Icon name="flame" className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{food.name}</p>
                      <p className={`mt-0.5 truncate text-xs ${selected ? "text-white/55" : "text-ink-500"}`}>
                        {food.serving_size}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-lg font-semibold leading-none">{formatCalories(food.calories)}</p>
                      <p className={`mt-1 text-[0.6rem] font-bold uppercase tracking-wider ${selected ? "text-white/40" : "text-ink-400"}`}>
                        kcal
                      </p>
                    </div>
                  </button>
                );
              })}
        </div>
        {!loadingFoods && foods.length === 0 && !foodsError ? (
          <p className="mt-5 rounded-2xl bg-ink-50 px-4 py-3 text-sm text-ink-500">
            The breakfast catalog is empty. Check the tracking service seed data.
          </p>
        ) : null}
      </div>
    </section>
  );
}
