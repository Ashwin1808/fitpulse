import type {
  CalorieCalculation,
  Food,
  Order,
  PlaceOrderInput,
  PlaceOrderResult,
  Product,
  Tracking,
  WorkerStats,
} from "./types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "Cannot reach the FitPulse services. Check that the stack is running.");
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message);
  }

  if (payload === null) {
    throw new ApiError(response.status, "The service returned an empty response.");
  }

  return payload as T;
}

export async function getFoods(): Promise<Food[]> {
  const data = await request<{ foods: Food[] }>("/api/foods");
  return data.foods;
}

export async function calculateCalories(foodId: number, quantity: number): Promise<CalorieCalculation> {
  return request<CalorieCalculation>("/api/calories/calculate", {
    method: "POST",
    body: JSON.stringify({ food_id: foodId, quantity }),
  });
}

export async function getProducts(): Promise<Product[]> {
  const data = await request<{ products: Product[] }>("/api/products");
  return data.products;
}

export async function getOrders(email?: string): Promise<Order[]> {
  const params = new URLSearchParams({ limit: "20" });
  if (email?.trim()) {
    params.set("email", email.trim());
  }
  const data = await request<{ orders: Order[] }>(`/api/orders?${params.toString()}`);
  return data.orders;
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  return request<PlaceOrderResult>("/api/orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getRecentTracking(): Promise<Tracking[]> {
  const data = await request<{ trackings: Tracking[] }>("/api/track");
  return data.trackings;
}

export async function getTracking(orderNumber: string): Promise<Tracking> {
  const data = await request<{ tracking: Tracking }>(
    `/api/track?order=${encodeURIComponent(orderNumber.trim())}`,
  );
  return data.tracking;
}

export async function getWorkerStats(): Promise<WorkerStats> {
  return request<WorkerStats>("/api/worker/stats");
}
