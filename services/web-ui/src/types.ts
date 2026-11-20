export type TabId = "nutrition" | "store" | "tracking";

export interface Food {
  id: number;
  name: string;
  description: string;
  category: string;
  serving_size: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface CalorieTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface CalorieCalculation {
  food: Food;
  quantity: number;
  totals: CalorieTotals;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  stock: number;
}

export interface OrderItem {
  product_id: number;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
}

export type OrderStatus =
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "CANCELLED";

export interface Order {
  id: number;
  order_number: string;
  customer_name: string;
  customer_email: string;
  status: OrderStatus;
  total_cents: number;
  created_at: string;
  items: OrderItem[];
}

export type TrackingStatus =
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "EXCEPTION";

export interface TrackingEvent {
  id: number;
  status: TrackingStatus;
  message: string;
  created_at: string;
}

export interface Tracking {
  id: number;
  order_id: number;
  order_number: string;
  status: TrackingStatus;
  carrier: string | null;
  tracking_code: string | null;
  estimated_delivery: string | null;
  updated_at: string;
  events: TrackingEvent[];
}

export interface WorkerStats {
  status: string;
  environment: string;
  consumer_group: string;
  consumer: string;
  stream: string;
  running: boolean;
  queue_available: boolean;
  stream_length: number;
  pending: number;
  processed: number;
  duplicates: number;
  ignored: number;
  errors: number;
  dead_lettered: number;
  last_event_at: string | null;
}

export interface PlaceOrderInput {
  customer_name: string;
  customer_email: string;
  items: Array<{
    product_id: number;
    quantity: number;
  }>;
}

export interface PlaceOrderResult {
  order: Order;
  event_enqueued: boolean;
}
