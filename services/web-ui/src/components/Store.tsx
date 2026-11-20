import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { getOrders, getProducts, placeOrder } from "../api";
import { getErrorMessage } from "../lib/errors";
import { formatDateTime, formatMoney } from "../lib/format";
import type { Order, PlaceOrderResult, Product } from "../types";
import { Icon, type IconName } from "./icons";
import {
  EmptyState,
  ErrorNotice,
  QuantityStepper,
  SectionIntro,
  Skeleton,
  Spinner,
  StatusBadge,
} from "./ui";

type Cart = Record<number, number>;

interface ProductVisual {
  gradient: string;
  icon: IconName;
}

const productVisuals: Record<string, ProductVisual> = {
  Strength: { gradient: "from-pulse-100 to-pulse-50 text-pulse-800", icon: "dumbbell" },
  Nutrition: { gradient: "from-amber-100 to-orange-50 text-amber-800", icon: "flame" },
  Recovery: { gradient: "from-sky-100 to-sky-50 text-sky-800", icon: "shield" },
  Conditioning: { gradient: "from-violet-100 to-violet-50 text-violet-800", icon: "bolt" },
  Accessories: { gradient: "from-ink-100 to-ink-50 text-ink-700", icon: "bag" },
  Wearables: { gradient: "from-clay-100 to-clay-50 text-clay-700", icon: "chart" },
};

const fallbackVisual: ProductVisual = {
  gradient: "from-ink-100 to-ink-50 text-ink-700",
  icon: "cube",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function visualFor(category: string): ProductVisual {
  return productVisuals[category] ?? fallbackVisual;
}

function stockLabel(stock: number): string {
  if (stock <= 0) {
    return "Sold out";
  }
  if (stock <= 5) {
    return `${stock} left`;
  }
  return `${stock} in stock`;
}

function stockTone(stock: number): string {
  if (stock <= 0) {
    return "bg-rose-100 text-rose-700";
  }
  if (stock <= 5) {
    return "bg-amber-100 text-amber-800";
  }
  return "bg-white/80 text-ink-600";
}

export function Store({ onTrack }: { onTrack: (orderNumber: string) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [cart, setCart] = useState<Cart>({});
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [placedOrder, setPlacedOrder] = useState<PlaceOrderResult | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    setProductsError(null);
    try {
      setProducts(await getProducts());
    } catch (error) {
      setProductsError(getErrorMessage(error));
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    setOrdersError(null);
    try {
      setOrders(await getOrders());
    } catch (error) {
      setOrdersError(getErrorMessage(error));
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
    void loadOrders();
  }, [loadProducts, loadOrders]);

  const cartLines = useMemo(
    () =>
      Object.entries(cart).flatMap(([rawId, quantity]) => {
        const product = products.find((item) => item.id === Number(rawId));
        return product && quantity > 0 ? [{ product, quantity }] : [];
      }),
    [cart, products],
  );

  const subtotalCents = cartLines.reduce(
    (total, line) => total + line.product.price_cents * line.quantity,
    0,
  );
  const totalUnits = cartLines.reduce((total, line) => total + line.quantity, 0);

  const addToCart = (product: Product) => {
    setCart((current) => {
      const existing = current[product.id] ?? 0;
      if (existing >= product.stock) {
        return current;
      }
      return { ...current, [product.id]: existing + 1 };
    });
  };

  const setCartQuantity = (product: Product, quantity: number) => {
    setCart((current) => {
      if (quantity <= 0) {
        const next = { ...current };
        delete next[product.id];
        return next;
      }
      return { ...current, [product.id]: Math.min(quantity, product.stock) };
    });
  };

  const removeFromCart = (productId: number) => {
    setCart((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  };

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCheckoutError(null);

    if (customerName.trim().length < 2) {
      setCheckoutError("Enter the name for this order.");
      return;
    }
    if (!EMAIL_PATTERN.test(customerEmail.trim())) {
      setCheckoutError("Enter a valid email address.");
      return;
    }
    if (cartLines.length === 0) {
      setCheckoutError("Add at least one item to your kit.");
      return;
    }

    setPlacingOrder(true);
    try {
      const result = await placeOrder({
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim(),
        items: cartLines.map((line) => ({
          product_id: line.product.id,
          quantity: line.quantity,
        })),
      });
      setPlacedOrder(result);
      setCart({});
      setCustomerName("");
      setCustomerEmail("");
      await Promise.all([loadProducts(), loadOrders()]);
    } catch (error) {
      setCheckoutError(getErrorMessage(error));
    } finally {
      setPlacingOrder(false);
    }
  };

  return (
    <section className="space-y-6">
      <SectionIntro
        eyebrow="The fitness store"
        title="Gear that keeps up."
        description="Build a kit from live stock, place an order, and follow it from checkout to your door. Quantities are reserved transactionally."
        action={
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-ink-900/10 bg-white px-3.5 py-2 text-xs font-semibold text-ink-600 sm:self-auto">
            <Icon name="cube" className="h-4 w-4 text-pulse-700" />
            {loadingProducts ? "Syncing catalog" : `${products.length} products live`}
          </div>
        }
      />

      {placedOrder ? (
        <div className="animate-fade-up overflow-hidden rounded-[1.5rem] border border-pulse-300 bg-pulse-50 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink-950 text-pulse-300">
                <Icon name="check" className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-ink-950">Order {placedOrder.order.order_number} is locked in.</p>
                <p className="mt-1 text-sm leading-6 text-ink-600">
                  {placedOrder.event_enqueued
                    ? "The fulfilment event is queued. Tracking will update as the worker processes it."
                    : "The order was saved, but the fulfilment event could not be queued. Tracking may be delayed."}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="btn-primary px-4 py-2.5 text-xs"
                onClick={() => onTrack(placedOrder.order.order_number)}
              >
                <Icon name="truck" className="h-4 w-4" />
                Track order
              </button>
              <button
                type="button"
                className="btn-ghost px-3.5 py-2.5 text-xs"
                onClick={() => setPlacedOrder(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {productsError ? <ErrorNotice message={productsError} onRetry={() => void loadProducts()} /> : null}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-4 sm:grid-cols-2">
          {loadingProducts
            ? Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-80" />)
            : products.map((product) => {
                const visual = visualFor(product.category);
                const inCart = cart[product.id] ?? 0;
                const soldOut = product.stock <= 0;
                const atLimit = inCart >= product.stock;

                return (
                  <article
                    key={product.id}
                    className="group flex flex-col overflow-hidden rounded-[1.5rem] border border-ink-900/10 bg-white shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift"
                  >
                    <div className={`relative h-36 overflow-hidden bg-gradient-to-br ${visual.gradient}`}>
                      <Icon
                        name={visual.icon}
                        className="absolute -bottom-5 -right-3 h-28 w-28 opacity-20 transition duration-300 group-hover:scale-105 group-hover:opacity-30"
                      />
                      <span className="inline-flex rounded-full bg-white/80 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-ink-700 backdrop-blur">
                        {product.category}
                      </span>
                      <span
                        className={`absolute right-4 top-4 rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.08em] ${stockTone(product.stock)}`}
                      >
                        {stockLabel(product.stock)}
                      </span>
                      {inCart > 0 ? (
                        <span className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-ink-950 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-pulse-300">
                          <Icon name="bag" className="h-3 w-3" />
                          {inCart} in kit
                        </span>
                      ) : null}
                    </div>

                    <div className="flex flex-1 flex-col p-5">
                      <h3 className="font-display text-lg font-semibold tracking-tight text-ink-950">{product.name}</h3>
                      <p className="mt-1.5 flex-1 text-sm leading-6 text-ink-500">{product.description}</p>
                      <div className="mt-5 flex items-center justify-between gap-3">
                        <p className="font-display text-xl font-semibold text-ink-950">{formatMoney(product.price_cents)}</p>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-ink-950 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-300"
                          onClick={() => addToCart(product)}
                          disabled={soldOut || atLimit}
                        >
                          <Icon name={atLimit && !soldOut ? "check" : "plus"} className="h-3.5 w-3.5" />
                          {soldOut ? "Sold out" : atLimit ? "Max in kit" : "Add to cart"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
        </div>

        <aside className="app-card p-6 lg:sticky lg:top-24">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Checkout</p>
              <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight">Your kit</h3>
            </div>
            <span className="rounded-full bg-ink-950 px-3 py-1 text-xs font-bold text-white">
              {totalUnits} {totalUnits === 1 ? "item" : "items"}
            </span>
          </div>

          {cartLines.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon="bag"
                title="Your kit is empty"
                description="Add gear from the catalog and it will appear here, ready for a transactional checkout."
              />
            </div>
          ) : (
            <>
              <ul className="mt-5 divide-y divide-ink-900/5">
                {cartLines.map(({ product, quantity }) => {
                  const visual = visualFor(product.category);
                  return (
                    <li key={product.id} className="py-4 first:pt-0">
                      <div className="flex items-start gap-3">
                        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${visual.gradient}`}>
                          <Icon name={visual.icon} className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold leading-5 text-ink-950">{product.name}</p>
                          <p className="mt-0.5 text-xs text-ink-500">{formatMoney(product.price_cents)} each</p>
                          <div className="mt-2.5 flex items-center justify-between gap-2">
                            <QuantityStepper
                              compact
                              value={quantity}
                              onChange={(value) => setCartQuantity(product, value)}
                              min={1}
                              max={product.stock}
                            />
                            <p className="text-sm font-bold text-ink-950">{formatMoney(product.price_cents * quantity)}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFromCart(product.id)}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-400 transition hover:bg-rose-50 hover:text-rose-600"
                          aria-label={`Remove ${product.name} from cart`}
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="space-y-2 border-t border-ink-900/10 pt-4 text-sm">
                <div className="flex items-center justify-between text-ink-500">
                  <span>Subtotal</span>
                  <span className="font-semibold text-ink-800">{formatMoney(subtotalCents)}</span>
                </div>
                <div className="flex items-center justify-between text-ink-500">
                  <span>Shipping</span>
                  <span className="font-semibold text-pulse-700">Free</span>
                </div>
                <div className="flex items-center justify-between pt-1 text-base font-bold text-ink-950">
                  <span>Total</span>
                  <span>{formatMoney(subtotalCents)}</span>
                </div>
              </div>

              <form className="mt-5 space-y-3 border-t border-ink-900/10 pt-5" onSubmit={submitOrder}>
                <div>
                  <label htmlFor="checkout-name" className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-ink-500">
                    Full name
                  </label>
                  <input
                    id="checkout-name"
                    className="input-field"
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    placeholder="Alex Morgan"
                    autoComplete="name"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="checkout-email" className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-ink-500">
                    Email
                  </label>
                  <input
                    id="checkout-email"
                    type="email"
                    className="input-field"
                    value={customerEmail}
                    onChange={(event) => setCustomerEmail(event.target.value)}
                    placeholder="alex@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
                {checkoutError ? <ErrorNotice title="Checkout needs attention" message={checkoutError} /> : null}
                <button type="submit" className="btn-lime w-full py-3.5" disabled={placingOrder}>
                  {placingOrder ? <Spinner className="h-4 w-4" label="Placing order" /> : <Icon name="arrowRight" className="h-4 w-4" />}
                  {placingOrder ? "Placing order" : "Place order"}
                </button>
                <p className="text-center text-[0.68rem] leading-4 text-ink-400">
                  Demo checkout. No payment details are collected.
                </p>
              </form>
            </>
          )}
        </aside>
      </div>

      <div className="app-card p-6 sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="eyebrow">Order history</p>
            <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight">Recent orders</h3>
          </div>
          <button type="button" className="btn-ghost self-start px-3.5 py-2 text-xs sm:self-auto" onClick={() => void loadOrders()}>
            <Icon name="refresh" className="h-3.5 w-3.5" />
            Refresh orders
          </button>
        </div>

        {ordersError ? (
          <div className="mt-5">
            <ErrorNotice message={ordersError} onRetry={() => void loadOrders()} />
          </div>
        ) : null}

        {loadingOrders ? (
          <div className="mt-5 space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : orders.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              icon="truck"
              title="No orders yet"
              description="Your first FitPulse order will appear here with its live fulfilment status."
            />
          </div>
        ) : (
          <div className="mt-4 divide-y divide-ink-900/5">
            {orders.map((order) => (
              <div key={order.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <p className="text-sm font-bold text-ink-950">{order.order_number}</p>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {formatDateTime(order.created_at)} · {order.customer_name} · {order.customer_email}
                  </p>
                  <p className="mt-1 truncate text-xs font-medium text-ink-600">
                    {order.items.map((item) => `${item.product_name} × ${item.quantity}`).join(" · ")}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <p className="font-display text-lg font-semibold text-ink-950">{formatMoney(order.total_cents)}</p>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-full border border-ink-900/15 bg-white px-3.5 py-2 text-xs font-bold text-ink-800 transition hover:border-ink-950 hover:bg-ink-950 hover:text-white"
                    onClick={() => onTrack(order.order_number)}
                  >
                    <Icon name="truck" className="h-3.5 w-3.5" />
                    Track
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
