import { Router } from "express";
import { getCache, setCache } from "../cache";
import { productsCacheKey } from "../cacheKeys";
import { config } from "../config";
import { pool } from "../db";
import { asyncHandler } from "../errors";
import { cacheRequestsTotal } from "../metrics";

interface Product {
  id: number;
  sku: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  stock: number;
}

export const productsRouter = Router();

productsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const cached = await getCache<Product[]>(productsCacheKey);
    if (cached !== null) {
      cacheRequestsTotal.inc({ result: "hit" });
      res.json({ products: cached });
      return;
    }

    cacheRequestsTotal.inc({ result: "miss" });
    const result = await pool.query<Product>(
      `SELECT id, sku, name, description, category, price_cents, stock
       FROM products
       ORDER BY category, name`,
    );

    await setCache(productsCacheKey, result.rows, config.cacheTtlSeconds);
    res.json({ products: result.rows });
  }),
);
