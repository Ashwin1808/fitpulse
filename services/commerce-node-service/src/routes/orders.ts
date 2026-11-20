import { randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import type { PoolClient } from "pg";
import { deleteCache, publishEvent } from "../cache";
import { productsCacheKey } from "../cacheKeys";
import { pool } from "../db";
import { HttpError, asyncHandler } from "../errors";
import { orderEventsTotal, ordersCreatedTotal } from "../metrics";

interface OrderItem {
  product_id: number;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
}

interface OrderRecord {
  id: number;
  order_number: string;
  customer_name: string;
  customer_email: string;
  status: string;
  total_cents: number;
  created_at: Date;
  items: OrderItem[];
}

interface ValidatedOrder {
  customerName: string;
  customerEmail: string;
  items: Array<{ productId: number; quantity: number }>;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const ORDER_SELECT = `
  SELECT
    o.id,
    o.order_number,
    o.customer_name,
    o.customer_email,
    o.status,
    o.total_cents,
    o.created_at,
    COALESCE(
      json_agg(
        json_build_object(
          'product_id', oi.product_id,
          'product_name', oi.product_name,
          'unit_price_cents', oi.unit_price_cents,
          'quantity', oi.quantity,
          'line_total_cents', oi.line_total_cents
        )
        ORDER BY oi.id
      ) FILTER (WHERE oi.id IS NOT NULL),
      '[]'::json
    ) AS items
  FROM orders o
  LEFT JOIN order_items oi ON oi.order_id = o.id
`;

export const ordersRouter = Router();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateOrder(body: unknown): ValidatedOrder {
  if (!isRecord(body)) {
    throw new HttpError(400, "Request body must be a JSON object");
  }

  const customerName = typeof body.customer_name === "string" ? body.customer_name.trim() : "";
  const customerEmail = typeof body.customer_email === "string" ? body.customer_email.trim() : "";
  const rawItems = body.items;

  if (customerName.length < 2 || customerName.length > 120) {
    throw new HttpError(400, "customer_name must be between 2 and 120 characters");
  }
  if (!EMAIL_PATTERN.test(customerEmail) || customerEmail.length > 200) {
    throw new HttpError(400, "customer_email must be a valid email address");
  }
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 20) {
    throw new HttpError(400, "items must contain between 1 and 20 entries");
  }

  const quantities = new Map<number, number>();
  for (const rawItem of rawItems) {
    if (!isRecord(rawItem)) {
      throw new HttpError(400, "Each item must be an object");
    }
    const productId = rawItem.product_id;
    const quantity = rawItem.quantity;
    if (typeof productId !== "number" || !Number.isInteger(productId) || productId <= 0) {
      throw new HttpError(400, "Each item requires a positive integer product_id");
    }
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0 || quantity > 20) {
      throw new HttpError(400, "Each item quantity must be between 1 and 20");
    }

    const nextQuantity = (quantities.get(productId) ?? 0) + quantity;
    if (nextQuantity > 20) {
      throw new HttpError(400, "Combined quantity for a product cannot exceed 20");
    }
    quantities.set(productId, nextQuantity);
  }

  return {
    customerName,
    customerEmail,
    items: [...quantities.entries()].map(([productId, quantity]) => ({ productId, quantity })),
  };
}

function generateOrderNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const randomPart = randomBytes(3).toString("hex").toUpperCase();
  return `FP-${datePart}-${randomPart}`;
}

function parseLimit(rawLimit: unknown): number {
  if (rawLimit === undefined) {
    return 20;
  }
  if (typeof rawLimit !== "string" || !/^\d+$/.test(rawLimit)) {
    throw new HttpError(400, "limit must be an integer between 1 and 50");
  }
  const limit = Number(rawLimit);
  if (limit < 1 || limit > 50) {
    throw new HttpError(400, "limit must be an integer between 1 and 50");
  }
  return limit;
}

function serializeOrder(row: OrderRecord): Omit<OrderRecord, "created_at"> & { created_at: string } {
  return {
    ...row,
    created_at: new Date(row.created_at).toISOString(),
  };
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    return;
  }
}

ordersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = validateOrder(req.body);
    const client = await pool.connect();
    let orderId = 0;
    let orderNumber = "";
    let totalCents = 0;
    let createdAt = new Date();
    const createdItems: OrderItem[] = [];

    try {
      await client.query("BEGIN");
      orderNumber = generateOrderNumber();
      const orderResult = await client.query<{ id: number; created_at: Date }>(
        `INSERT INTO orders (order_number, customer_name, customer_email, status, total_cents)
         VALUES ($1, $2, $3, 'CONFIRMED', 0)
         RETURNING id, created_at`,
        [orderNumber, input.customerName, input.customerEmail],
      );

      orderId = orderResult.rows[0].id;
      createdAt = orderResult.rows[0].created_at;

      for (const item of input.items) {
        const stockResult = await client.query<{ name: string; price_cents: number }>(
          `UPDATE products
           SET stock = stock - $1
           WHERE id = $2 AND stock >= $1
           RETURNING name, price_cents`,
          [item.quantity, item.productId],
        );

        if (!stockResult.rowCount) {
          const product = await client.query<{ name: string }>(
            "SELECT name FROM products WHERE id = $1",
            [item.productId],
          );
          if (!product.rowCount) {
            throw new HttpError(404, `Product ${item.productId} was not found`);
          }
          throw new HttpError(409, `Insufficient stock for ${product.rows[0].name}`);
        }

        const product = stockResult.rows[0];
        const lineTotalCents = product.price_cents * item.quantity;
        totalCents += lineTotalCents;

        await client.query(
          `INSERT INTO order_items
             (order_id, product_id, product_name, unit_price_cents, quantity, line_total_cents)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [orderId, item.productId, product.name, product.price_cents, item.quantity, lineTotalCents],
        );

        createdItems.push({
          product_id: item.productId,
          product_name: product.name,
          unit_price_cents: product.price_cents,
          quantity: item.quantity,
          line_total_cents: lineTotalCents,
        });
      }

      await client.query("UPDATE orders SET total_cents = $1 WHERE id = $2", [totalCents, orderId]);
      await client.query("COMMIT");
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }

    ordersCreatedTotal.inc();
    await deleteCache(productsCacheKey);

    const eventEnqueued = await publishEvent({
      event_id: randomUUID(),
      type: "order.created",
      occurred_at: new Date().toISOString(),
      data: {
        order_id: orderId,
        order_number: orderNumber,
        customer_email: input.customerEmail,
        total_cents: totalCents,
      },
    });
    orderEventsTotal.inc({ result: eventEnqueued ? "published" : "failed" });

    res.status(201).json({
      order: {
        id: orderId,
        order_number: orderNumber,
        customer_name: input.customerName,
        customer_email: input.customerEmail,
        status: "CONFIRMED",
        total_cents: totalCents,
        created_at: new Date(createdAt).toISOString(),
        items: createdItems,
      },
      event_enqueued: eventEnqueued,
    });
  }),
);

ordersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const rawEmail = req.query.email;
    if (rawEmail !== undefined && typeof rawEmail !== "string") {
      throw new HttpError(400, "email must be a single value");
    }
    const email = rawEmail?.trim() || null;
    if (email && email.length > 200) {
      throw new HttpError(400, "email is too long");
    }
    const limit = parseLimit(req.query.limit);

    const result = await pool.query<OrderRecord>(
      `${ORDER_SELECT}
       WHERE ($1::text IS NULL OR lower(o.customer_email) = lower($1::text))
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT $2`,
      [email, limit],
    );

    res.json({ orders: result.rows.map(serializeOrder) });
  }),
);

ordersRouter.get(
  "/:orderNumber",
  asyncHandler(async (req, res) => {
    const orderNumber = req.params.orderNumber.trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,64}$/.test(orderNumber)) {
      throw new HttpError(400, "Invalid order number");
    }

    const result = await pool.query<OrderRecord>(
      `${ORDER_SELECT}
       WHERE o.order_number = $1
       GROUP BY o.id
       LIMIT 1`,
      [orderNumber],
    );

    if (!result.rowCount) {
      throw new HttpError(404, "Order not found");
    }

    res.json({ order: serializeOrder(result.rows[0]) });
  }),
);
